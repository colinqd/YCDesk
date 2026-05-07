
#include "RemoteDeskCredentialProvider.h"
#include <stdio.h>
#include <time.h>
#include <string>
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif
#include <wincred.h>

static LONG g_cRefDll = 0;
static HMODULE g_hinst = NULL;

static void LogToFile(const char* format, ...)
{
    char buffer[4096];
    va_list args;
    va_start(args, format);
    vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);

    wchar_t logPath[MAX_PATH] = {0};
    HKEY hKey = NULL;
    bool useRegistryPathFound = false;

    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\RemoteDesk", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        DWORD cbData = sizeof(logPath);
        if (RegQueryValueExW(hKey, L"InstallPath", NULL, NULL, (LPBYTE)logPath, &cbData) == ERROR_SUCCESS && logPath[0] != L'\0') {
            useRegistryPathFound = true;
        }
        RegCloseKey(hKey);
    }

    if (!useRegistryPathFound) {
        GetModuleFileNameW(NULL, logPath, MAX_PATH);
        wchar_t* lastSlash = wcsrchr(logPath, L'\\');
        if (lastSlash) {
            *(lastSlash + 1) = L'\0';
        }
    }

    wcscat_s(logPath, MAX_PATH, L"\\cred_provider.log");

    FILE* f = _wfopen(logPath, L"a");
    if (f)
    {
        time_t now = time(NULL);
        struct tm* t = localtime(&now);
        fwprintf(f, L"[%04d-%02d-%02d %02d:%02d:%02d] %S\n",
            t->tm_year + 1900, t->tm_mon + 1, t->tm_mday,
            t->tm_hour, t->tm_min, t->tm_sec, buffer);
        fclose(f);
    }
}

// ========== UnlockIpcClient Implementation ==========
UnlockIpcClient::UnlockIpcClient() : _hPipe(INVALID_HANDLE_VALUE)
{
}

UnlockIpcClient::~UnlockIpcClient()
{
    Disconnect();
}

bool UnlockIpcClient::Connect()
{
    if (_hPipe != INVALID_HANDLE_VALUE)
    {
        return true;
    }

    _hPipe = CreateFileW(
        L"\\\\.\\pipe\\RemoteDeskUnlock",
        GENERIC_READ | GENERIC_WRITE,
        0, NULL, OPEN_EXISTING, 0, NULL);

    if (_hPipe == INVALID_HANDLE_VALUE)
    {
        DWORD dwError = GetLastError();
        LogToFile("IPC Connect failed: %lu", dwError);
        return false;
    }

    DWORD dwMode = PIPE_READMODE_MESSAGE;
    if (!SetNamedPipeHandleState(_hPipe, &dwMode, NULL, NULL))
    {
        LogToFile("IPC SetNamedPipeHandleState failed: %lu", GetLastError());
        CloseHandle(_hPipe);
        _hPipe = INVALID_HANDLE_VALUE;
        return false;
    }

    LogToFile("IPC Connected");
    return true;
}

bool UnlockIpcClient::Disconnect()
{
    if (_hPipe != INVALID_HANDLE_VALUE)
    {
        CloseHandle(_hPipe);
        _hPipe = INVALID_HANDLE_VALUE;
        LogToFile("IPC Disconnected");
    }
    return true;
}

bool UnlockIpcClient::RequestUnlock(_Outptr_result_z_ PWSTR* ppszUsername, _Outptr_result_z_ PWSTR* ppszPassword)
{
    *ppszUsername = NULL;
    *ppszPassword = NULL;

    if (_hPipe == INVALID_HANDLE_VALUE)
    {
        LogToFile("IPC RequestUnlock: not connected");
        return false;
    }

    // IMPORTANT: Must match server's expected command "REQUEST_UNLOCK" (wide char)
    const wchar_t* request = L"REQUEST_UNLOCK";
    DWORD bytesWritten = 0;
    if (!WriteFile(_hPipe, request, (DWORD)(wcslen(request) + 1) * sizeof(wchar_t), &bytesWritten, NULL))
    {
        LogToFile("IPC RequestUnlock: WriteFile failed: %lu", GetLastError());
        return false;
    }

    // Server responds with wide char: username\0password\0 (or empty if no credentials)
    wchar_t response[4096] = {0};
    DWORD bytesRead = 0;
    if (!ReadFile(_hPipe, response, sizeof(response) - sizeof(wchar_t), &bytesRead, NULL))
    {
        LogToFile("IPC RequestUnlock: ReadFile failed: %lu", GetLastError());
        return false;
    }

    // Check for empty response (no credentials available)
    if (bytesRead == 0 || response[0] == L'\0')
    {
        LogToFile("IPC RequestUnlock: no credentials available");
        return false;
    }

    // Parse response: "username\0password" (double null separated wide chars)
    size_t usernameLen = wcslen(response);
    if (usernameLen == 0)
    {
        LogToFile("IPC RequestUnlock: empty username");
        return false;
    }

    // Password starts after username + null terminator
    const wchar_t* password = response + usernameLen + 1;
    size_t passwordLen = wcslen(password);

    // Allocate and copy username
    *ppszUsername = (PWSTR)CoTaskMemAlloc((usernameLen + 1) * sizeof(wchar_t));
    if (!*ppszUsername)
    {
        LogToFile("IPC RequestUnlock: CoTaskMemAlloc failed for username");
        return false;
    }
    CopyMemory(*ppszUsername, response, (usernameLen + 1) * sizeof(wchar_t));

    // Allocate and copy password
    *ppszPassword = (PWSTR)CoTaskMemAlloc((passwordLen + 1) * sizeof(wchar_t));
    if (!*ppszPassword)
    {
        CoTaskMemFree(*ppszUsername);
        *ppszUsername = NULL;
        LogToFile("IPC RequestUnlock: CoTaskMemAlloc failed for password");
        return false;
    }
    CopyMemory(*ppszPassword, password, (passwordLen + 1) * sizeof(wchar_t));

    LogToFile("IPC RequestUnlock: got credentials (username=%ls, password_len=%zu)", *ppszUsername, passwordLen);
    return true;
}

// ========== RemoteDeskCredentialProvider ==========
RemoteDeskCredentialProvider::RemoteDeskCredentialProvider()
    : _cRef(1), _pcpe(NULL), _upAdviseContext(0), _cpus(CPUS_INVALID), _pCredProviderUserArray(NULL)
{
    LogToFile("Provider created");
    g_cRefDll++;
}

RemoteDeskCredentialProvider::~RemoteDeskCredentialProvider()
{
    LogToFile("Provider destroyed");
    _CleanupCredentials();

    if (_pCredProviderUserArray)
    {
        _pCredProviderUserArray->Release();
        _pCredProviderUserArray = NULL;
    }
    g_cRefDll--;
}

IFACEMETHODIMP_(ULONG) RemoteDeskCredentialProvider::AddRef()
{
    return InterlockedIncrement(&_cRef);
}

IFACEMETHODIMP_(ULONG) RemoteDeskCredentialProvider::Release()
{
    LONG cRef = InterlockedDecrement(&_cRef);
    if (!cRef)
        delete this;
    return cRef;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::QueryInterface(REFIID riid, void** ppv)
{
    static const QITAB qit[] =
    {
        QITABENT(RemoteDeskCredentialProvider, ICredentialProvider),
        QITABENT(RemoteDeskCredentialProvider, ICredentialProviderSetUserArray),
        { 0 },
    };

    HRESULT hr = QISearch(this, qit, riid, ppv);

    LPOLESTR pszIID = NULL;
    if (SUCCEEDED(StringFromIID(riid, &pszIID)))
    {
        LogToFile("Provider QueryInterface: %ls, hr=0x%08X", pszIID, hr);
        CoTaskMemFree(pszIID);
    }

    return hr;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, DWORD)
{
    LogToFile("Provider SetUsageScenario: %d", cpus);
    _cpus = cpus;

    // Important: Cleanup and re-enumerate credentials when scenario changes
    // This ensures the tile is ready for the current usage scenario
    _CleanupCredentials();

    // Enumerate credentials for the new scenario
    _EnumerateCredentials();

    LogToFile("Provider SetUsageScenario: Complete, credential count = %d", static_cast<int>(_rgpCredentials.size()));
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION*)
{
    LogToFile("Provider SetSerialization");
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::Advise(ICredentialProviderEvents* pcpe, UINT_PTR upAdviseContext)
{
    LogToFile("Provider Advise");
    _pcpe = pcpe;
    if (_pcpe)
        _pcpe->AddRef();
    _upAdviseContext = upAdviseContext;
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::UnAdvise()
{
    LogToFile("Provider UnAdvise");
    if (_pcpe)
    {
        _pcpe->Release();
        _pcpe = NULL;
    }
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::GetFieldDescriptorCount(DWORD* pdwCount)
{
    LogToFile("Provider GetFieldDescriptorCount");
    if (!pdwCount)
    {
        return E_INVALIDARG;
    }
    *pdwCount = SFI_NUM_FIELDS;
    LogToFile("Provider GetFieldDescriptorCount = %d", *pdwCount);
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::GetFieldDescriptorAt(DWORD dwIndex, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd)
{
    LogToFile("Provider GetFieldDescriptorAt, index=%d", dwIndex);
    
    if (!ppcpfd)
    {
        return E_INVALIDARG;
    }
    
    if (dwIndex >= SFI_NUM_FIELDS)
    {
        return E_INVALIDARG;
    }
    
    *ppcpfd = NULL;
    
    CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR cpfd;
    ZeroMemory(&cpfd, sizeof(cpfd));
    cpfd.dwFieldID = dwIndex;
    
    PWSTR pszLabel = NULL;
    switch (dwIndex)
    {
    case SFI_TILEIMAGE:
        cpfd.cpft = CPFT_TILE_IMAGE;
        pszLabel = L"RemoteDesk";
        break;
    case SFI_LARGETEXT:
        cpfd.cpft = CPFT_LARGE_TEXT;
        pszLabel = L"RemoteDesk";
        break;
    case SFI_SMALLTEXT:
        cpfd.cpft = CPFT_SMALL_TEXT;
        pszLabel = L"Remote Desktop Unlock";
        break;
    case SFI_USERNAME:
        cpfd.cpft = CPFT_EDIT_TEXT;
        pszLabel = L"Username";
        break;
    case SFI_PASSWORD:
        cpfd.cpft = CPFT_PASSWORD_TEXT;
        pszLabel = L"Password";
        break;
    case SFI_SUBMIT_BUTTON:
        cpfd.cpft = CPFT_SUBMIT_BUTTON;
        pszLabel = L"Sign in";
        break;
    default:
        return E_INVALIDARG;
    }
    
    HRESULT hr = SHStrDupW(pszLabel, &cpfd.pszLabel);
    if (FAILED(hr))
    {
        return hr;
    }
    
    *ppcpfd = (CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR*)CoTaskMemAlloc(sizeof(CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR));
    if (!*ppcpfd)
    {
        CoTaskMemFree(cpfd.pszLabel);
        return E_OUTOFMEMORY;
    }
    
    CopyMemory(*ppcpfd, &cpfd, sizeof(cpfd));
    LogToFile("Provider GetFieldDescriptorAt SUCCESS for field %d", dwIndex);
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::GetCredentialCount(DWORD* pdwCount, DWORD* pdwDefault, BOOL* pbAutoLogonWithDefault)
{
    LogToFile("Provider GetCredentialCount");

    if (_rgpCredentials.empty())
    {
        _EnumerateCredentials();
    }

    *pdwCount = static_cast<DWORD>(_rgpCredentials.size());
    *pdwDefault = CREDENTIAL_PROVIDER_NO_DEFAULT;
    *pbAutoLogonWithDefault = FALSE;
    LogToFile("Provider GetCredentialCount = %d", *pdwCount);
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::GetCredentialAt(DWORD dwIndex, ICredentialProviderCredential** ppcpc)
{
    *ppcpc = NULL;
    HRESULT hr = E_INVALIDARG;

    LogToFile("Provider GetCredentialAt %d", dwIndex);

    if (dwIndex < _rgpCredentials.size())
    {
        *ppcpc = _rgpCredentials[dwIndex];
        (*ppcpc)->AddRef();
        hr = S_OK;
        LogToFile("Provider GetCredentialAt SUCCESS");
    }
    return hr;
}

IFACEMETHODIMP RemoteDeskCredentialProvider::SetUserArray(ICredentialProviderUserArray *users)
{
    LogToFile("Provider SetUserArray called");

    if (_pCredProviderUserArray)
    {
        _pCredProviderUserArray->Release();
        _pCredProviderUserArray = NULL;
    }

    _pCredProviderUserArray = users;
    if (_pCredProviderUserArray)
    {
        _pCredProviderUserArray->AddRef();
    }

    // Important: Enumerate credentials with the new user array!
    _CleanupCredentials();
    _EnumerateCredentials();
    
    return S_OK;
}

HRESULT RemoteDeskCredentialProvider::_EnumerateCredentials()
{
    LogToFile("Provider EnumerateCredentials");

    _CleanupCredentials();

    RemoteDeskCredential *pCredential = new RemoteDeskCredential(this);
    if (pCredential)
    {
        HRESULT hr = pCredential->Initialize(_cpus, NULL);
        if (SUCCEEDED(hr))
        {
            _rgpCredentials.push_back(pCredential);
            LogToFile("Provider Enumerate: Added 1 credential!");
        }
        else
        {
            delete pCredential;
        }
    }
    
    return S_OK;
}

HRESULT RemoteDeskCredentialProvider::_CleanupCredentials()
{
    for (auto cred : _rgpCredentials)
    {
        cred->Release();
    }
    _rgpCredentials.clear();
    return S_OK;
}

RemoteDeskCredential::RemoteDeskCredential(RemoteDeskCredentialProvider* pProvider)
    : _cRef(1), _pProvider(pProvider), _cpus(CPUS_INVALID), _pcpce(NULL),
    _pszUserSid(NULL), _pszQualifiedUserName(NULL),
    _pszUsername(NULL), _pszPassword(NULL)
{
    LogToFile("Credential created");
    _pProvider->AddRef();
    ZeroMemory(_rgFieldStrings, sizeof(_rgFieldStrings));
    ZeroMemory(_rgFieldStatePairs, sizeof(_rgFieldStatePairs));
    ZeroMemory(_rgCredProvFieldDescriptors, sizeof(_rgCredProvFieldDescriptors));
}

RemoteDeskCredential::~RemoteDeskCredential()
{
    LogToFile("Credential destroyed");
    if (_pcpce)
    {
        _pcpce->Release();
    }
    if (_pszUserSid)
        CoTaskMemFree(_pszUserSid);
    if (_pszQualifiedUserName)
        CoTaskMemFree(_pszQualifiedUserName);
    if (_pszUsername)
        CoTaskMemFree(_pszUsername);
    if (_pszPassword)
        CoTaskMemFree(_pszPassword);

    for (DWORD i = 0; i < SFI_NUM_FIELDS; i++)
    {
        if (_rgFieldStrings[i])
            CoTaskMemFree(_rgFieldStrings[i]);
    }

    _pProvider->Release();
}

HRESULT RemoteDeskCredential::Initialize(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, ICredentialProviderUser* pCredUser)
{
    LogToFile("Credential Initialize, cpus=%d", cpus);
    _cpus = cpus;

    // Initialize all fields - this is CRITICAL for displaying the tile!
    ZeroMemory(_rgFieldStrings, sizeof(_rgFieldStrings));
    ZeroMemory(_rgFieldStatePairs, sizeof(_rgFieldStatePairs));

    // Initialize all CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR
    for (DWORD i = 0; i < SFI_NUM_FIELDS; ++i)
    {
        _rgCredProvFieldDescriptors[i].dwFieldID = i;
        switch (i)
        {
        case SFI_TILEIMAGE:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_TILE_IMAGE;
            break;
        case SFI_LARGETEXT:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_LARGE_TEXT;
            break;
        case SFI_SMALLTEXT:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_SMALL_TEXT;
            break;
        case SFI_USERNAME:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_EDIT_TEXT;
            break;
        case SFI_PASSWORD:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_PASSWORD_TEXT;
            break;
        case SFI_SUBMIT_BUTTON:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_SUBMIT_BUTTON;
            break;
        default:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_INVALID;
            break;
        }
    }

    // Get user SID from ICredentialProviderUser (CRITICAL!)
    if (pCredUser)
    {
        HRESULT hr = pCredUser->GetSid(&_pszUserSid);
        if (SUCCEEDED(hr))
        {
            LogToFile("Credential Initialize: Got user SID");
        }
        
        hr = pCredUser->GetStringValue(PKEY_Identity_QualifiedUserName, &_pszQualifiedUserName);
        if (SUCCEEDED(hr))
        {
            LogToFile("Credential Initialize: Got qualified username: %ls", _pszQualifiedUserName);
        }
    }

    // Initialize default field strings (required for display)
    if (SUCCEEDED(SHStrDupW(L"RemoteDesk", &_rgFieldStrings[SFI_LARGETEXT])))
    {
        LogToFile("Credential Initialize: Set large text OK");
    }

    if (SUCCEEDED(SHStrDupW(L"Click to unlock with RemoteDesk", &_rgFieldStrings[SFI_SMALLTEXT])))
    {
        LogToFile("Credential Initialize: Set small text OK");
    }

    // For CPUS_LOGON (1), pre-fill username but leave password blank for user input
    // This provides convenience while maintaining security
    if (_cpus == CPUS_LOGON)
    {
        LogToFile("Credential Initialize: Logon scenario - pre-filling default username");
        
        // Try to get the current session username
        DWORD dwSessionId = WTS_CURRENT_SESSION;
        if (ProcessIdToSessionId(GetCurrentProcessId(), &dwSessionId))
        {
            LogToFile("Credential Initialize: Session ID: %d", dwSessionId);
            LPWSTR pBuffer = NULL;
            DWORD dwBytesReturned = 0;
            if (WTSQuerySessionInformationW(WTS_CURRENT_SERVER_HANDLE, dwSessionId, WTSUserName, &pBuffer, &dwBytesReturned))
            {
                if (pBuffer != NULL && wcslen(pBuffer) > 0 && wcscmp(pBuffer, L"SYSTEM") != 0)
                {
                    if (SUCCEEDED(SHStrDupW(pBuffer, &_rgFieldStrings[SFI_USERNAME])))
                    {
                        LogToFile("Credential Initialize: Set default username from WTS: %ls", pBuffer);
                    }
                }
                WTSFreeMemory(pBuffer);
            }
        }
        
        // If WTS failed or returned SYSTEM, try registry enumeration
        if (!_rgFieldStrings[SFI_USERNAME])
        {
            LogToFile("Credential Initialize: Method 2 - Registry enumeration...");
            HKEY hKeyEnum;
            if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList", 0, KEY_READ, &hKeyEnum) == ERROR_SUCCESS)
            {
                WCHAR szSubKey[256];
                DWORD dwIndex = 0;
                while (RegEnumKeyW(hKeyEnum, dwIndex, szSubKey, ARRAYSIZE(szSubKey)) == ERROR_SUCCESS)
                {
                    HKEY hSubKey;
                    if (RegOpenKeyExW(hKeyEnum, szSubKey, 0, KEY_READ, &hSubKey) == ERROR_SUCCESS)
                    {
                        WCHAR szProfilePath[512] = {0};
                        DWORD dwSize = sizeof(szProfilePath);
                        if (RegQueryValueExW(hSubKey, L"ProfileImagePath", NULL, NULL, (LPBYTE)szProfilePath, &dwSize) == ERROR_SUCCESS)
                        {
                            // Look for user profile folders
                            PWSTR pszLastSlash = wcsrchr(szProfilePath, L'\\');
                            if (pszLastSlash != NULL)
                            {
                                PWSTR pszUsername = pszLastSlash + 1;
                                if (wcslen(pszUsername) > 0 && wcscmp(pszUsername, L"SYSTEM") != 0 && wcscmp(pszUsername, L"Public") != 0)
                                {
                                    if (SUCCEEDED(SHStrDupW(pszUsername, &_rgFieldStrings[SFI_USERNAME])))
                                    {
                                        LogToFile("Credential Initialize: Set default username from registry: %ls", pszUsername);
                                        RegCloseKey(hSubKey);
                                        break;
                                    }
                                }
                            }
                        }
                        RegCloseKey(hSubKey);
                    }
                    dwIndex++;
                }
                RegCloseKey(hKeyEnum);
            }
        }
        
        if (!_rgFieldStrings[SFI_USERNAME])
        {
            LogToFile("Credential Initialize: Could not determine default username");
        }
        
        // Never pre-fill password in Logon scenario for security
        LogToFile("Credential Initialize: Complete! (password left blank for user)");
        return S_OK;
    }

    // For CPUS_UNLOCK (2) and CPUS_CREDUI (3), try to pre-fill credentials
    LogToFile("Credential Initialize: Unlock/CredUI scenario - trying to pre-fill credentials");

    // Try to get saved auto login settings from registry
    bool bGotUsername = false;
    bool bAutoLoginEnabled = false;
    std::wstring strAutoUsername;
    std::wstring strAutoPassword;

    HKEY hKey;
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\RemoteDesk", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS)
    {
        DWORD dwEnabled = 0;
        DWORD dwSize = sizeof(dwEnabled);
        if (RegQueryValueExW(hKey, L"AutoLoginEnabled", NULL, NULL, (LPBYTE)&dwEnabled, &dwSize) == ERROR_SUCCESS)
        {
            bAutoLoginEnabled = (dwEnabled != 0);
            LogToFile("Credential Initialize: Auto login enabled: %d", bAutoLoginEnabled);
        }

        if (bAutoLoginEnabled)
        {
            WCHAR szUsername[512] = {0};
            dwSize = sizeof(szUsername);
            if (RegQueryValueExW(hKey, L"AutoLoginUsername", NULL, NULL, (LPBYTE)szUsername, &dwSize) == ERROR_SUCCESS && szUsername[0] != L'\0')
            {
                strAutoUsername = szUsername;
            }

            WCHAR szPassword[512] = {0};
            dwSize = sizeof(szPassword);
            if (RegQueryValueExW(hKey, L"AutoLoginPassword", NULL, NULL, (LPBYTE)szPassword, &dwSize) == ERROR_SUCCESS && szPassword[0] != L'\0')
            {
                strAutoPassword = szPassword;
            }
        }

        RegCloseKey(hKey);
    }

    if (bAutoLoginEnabled && !strAutoUsername.empty() && !strAutoPassword.empty())
    {
        // Use saved auto login credentials
        if (SUCCEEDED(SHStrDupW(strAutoUsername.c_str(), &_rgFieldStrings[SFI_USERNAME])))
        {
            LogToFile("Credential Initialize: Set auto login username: %ls", strAutoUsername.c_str());
            bGotUsername = true;
        }
        if (SUCCEEDED(SHStrDupW(strAutoPassword.c_str(), &_rgFieldStrings[SFI_PASSWORD])))
        {
            LogToFile("Credential Initialize: Set auto login password");
        }
    }
    else
    {
        // Fall back to old methods if no auto login credentials
        // Method 1: Try WTS API first (most reliable in session context)
        LogToFile("Credential Initialize: Method 1 - WTS API...");
        DWORD dwSessionId = WTS_CURRENT_SESSION;
        if (ProcessIdToSessionId(GetCurrentProcessId(), &dwSessionId))
        {
            LogToFile("Credential Initialize: Session ID: %d", dwSessionId);
            LPWSTR pBuffer = NULL;
            DWORD dwBytesReturned = 0;
            if (WTSQuerySessionInformationW(WTS_CURRENT_SERVER_HANDLE, dwSessionId, WTSUserName, &pBuffer, &dwBytesReturned))
            {
                if (pBuffer != NULL && wcslen(pBuffer) > 0 && wcscmp(pBuffer, L"SYSTEM") != 0)
                {
                    if (SUCCEEDED(SHStrDupW(pBuffer, &_rgFieldStrings[SFI_USERNAME])))
                    {
                        LogToFile("Credential Initialize: Set username from WTS: %ls", pBuffer);
                        bGotUsername = true;
                    }
                }
                WTSFreeMemory(pBuffer);
            }
        }
        
        // Method 2: Try enumerating all users from registry
        if (!bGotUsername)
        {
            LogToFile("Credential Initialize: Method 2 - Registry enumeration...");
            HKEY hKeyEnum;
            if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList", 0, KEY_READ, &hKeyEnum) == ERROR_SUCCESS)
            {
                WCHAR szSubKey[256];
                DWORD dwIndex = 0;
                while (RegEnumKeyW(hKeyEnum, dwIndex, szSubKey, ARRAYSIZE(szSubKey)) == ERROR_SUCCESS)
                {
                    HKEY hSubKey;
                    if (RegOpenKeyExW(hKeyEnum, szSubKey, 0, KEY_READ, &hSubKey) == ERROR_SUCCESS)
                    {
                        WCHAR szProfilePath[512] = {0};
                        DWORD dwSize = sizeof(szProfilePath);
                        if (RegQueryValueExW(hSubKey, L"ProfileImagePath", NULL, NULL, (LPBYTE)szProfilePath, &dwSize) == ERROR_SUCCESS)
                        {
                            // Look for user profile folders
                            PWSTR pszLastSlash = wcsrchr(szProfilePath, L'\\');
                            if (pszLastSlash != NULL)
                            {
                                PWSTR pszUsername = pszLastSlash + 1;
                                if (wcslen(pszUsername) > 0 && wcscmp(pszUsername, L"SYSTEM") != 0 && wcscmp(pszUsername, L"Public") != 0)
                                {
                                    if (SUCCEEDED(SHStrDupW(pszUsername, &_rgFieldStrings[SFI_USERNAME])))
                                    {
                                        LogToFile("Credential Initialize: Set username from registry: %ls", pszUsername);
                                        bGotUsername = true;
                                        RegCloseKey(hSubKey);
                                        break;
                                    }
                                }
                            }
                        }
                        RegCloseKey(hSubKey);
                    }
                    dwIndex++;
                }
                RegCloseKey(hKeyEnum);
            }
        }
        
        // Method 3: Last resort - leave blank (user will fill)
        if (!bGotUsername)
        {
            LogToFile("Credential Initialize: No username found - leaving blank");
        }
    }

    LogToFile("Credential Initialize: Complete!");
    return S_OK;
}

IFACEMETHODIMP_(ULONG) RemoteDeskCredential::AddRef()
{
    return InterlockedIncrement(&_cRef);
}

IFACEMETHODIMP_(ULONG) RemoteDeskCredential::Release()
{
    LONG cRef = InterlockedDecrement(&_cRef);
    if (!cRef)
        delete this;
    return cRef;
}

IFACEMETHODIMP RemoteDeskCredential::QueryInterface(REFIID riid, void** ppv)
{
    static const QITAB qit[] =
    {
        QITABENT(RemoteDeskCredential, ICredentialProviderCredential),
        QITABENT(RemoteDeskCredential, ICredentialProviderCredential2),
        QITABENT(RemoteDeskCredential, ICredentialProviderCredentialWithFieldOptions),
        { 0 },
    };
    HRESULT hr = QISearch(this, qit, riid, ppv);

    LPOLESTR pszIID = NULL;
    if (SUCCEEDED(StringFromIID(riid, &pszIID)))
    {
        LogToFile("Credential QueryInterface: %ls, hr=0x%08X", pszIID, hr);
        CoTaskMemFree(pszIID);
    }
    return hr;
}

IFACEMETHODIMP RemoteDeskCredential::Advise(ICredentialProviderCredentialEvents* pcpce)
{
    LogToFile("Credential Advise");
    _pcpce = pcpce;
    if (_pcpce)
        _pcpce->AddRef();
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::UnAdvise()
{
    LogToFile("Credential UnAdvise");
    if (_pcpce)
    {
        _pcpce->Release();
        _pcpce = NULL;
    }
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::SetSelected(BOOL* pbAutoLogon)
{
    LogToFile("Credential SetSelected");
    
    if (pbAutoLogon)
    {
        *pbAutoLogon = FALSE;
        LogToFile("Credential SetSelected: pbAutoLogon=FALSE");
    }
    
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::SetDeselected()
{
    LogToFile("Credential SetDeselected");
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetFieldState(DWORD dwFieldID, CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs, CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis)
{
    LogToFile("Credential GetFieldState %d", dwFieldID);
    
    if (!pcpfs || !pcpfis)
    {
        return E_INVALIDARG;
    }
    
    if (dwFieldID >= SFI_NUM_FIELDS)
    {
        return E_INVALIDARG;
    }
    
    // Default states
    *pcpfs = CPFS_DISPLAY_IN_BOTH;
    *pcpfis = CPFIS_NONE;
    
    // Specific field handling
    switch (dwFieldID)
    {
    case SFI_TILEIMAGE:
        // Tile image is always visible in both scenarios
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        break;

    case SFI_LARGETEXT:
    case SFI_SMALLTEXT:
        // Title and subtitle are always visible
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        break;

    case SFI_USERNAME:
    case SFI_PASSWORD:
        // Input fields are available in both scenarios
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        break;

    case SFI_SUBMIT_BUTTON:
        // Submit button is always available
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        break;

    default:
        // Unknown field - hide it
        *pcpfs = CPFS_HIDDEN;
        *pcpfis = CPFIS_NONE;
        break;
    }
    
    LogToFile("Credential GetFieldState %d: state=%d, interactive=%d", 
               dwFieldID, *pcpfs, *pcpfis);
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetStringValue(DWORD dwFieldID, PWSTR* ppwsz)
{
    *ppwsz = NULL;
    LogToFile("Credential GetStringValue %d", dwFieldID);
    
    if (dwFieldID >= SFI_NUM_FIELDS)
    {
        return E_INVALIDARG;
    }
    
    if (!ppwsz)
    {
        return E_INVALIDARG;
    }
    
    if (_rgFieldStrings[dwFieldID])
    {
        HRESULT hr = SHStrDupW(_rgFieldStrings[dwFieldID], ppwsz);
        if (SUCCEEDED(hr))
        {
            LogToFile("Credential GetStringValue %d: OK, returning: %ls", dwFieldID, *ppwsz);
        }
        return hr;
    }
    
    LogToFile("Credential GetStringValue %d: No value stored", dwFieldID);
    return S_OK;
}

// ---------------------------------------------------------------------------
// Helper: Create a simple tile bitmap (64x64 pixels with a colored square)
// ---------------------------------------------------------------------------
static HRESULT CreateTileBitmap(HBITMAP* phbmp)
{
    if (!phbmp)
    {
        return E_INVALIDARG;
    }

    *phbmp = NULL;

    // Create a 64x64 bitmap
    HDC hdcScreen = GetDC(NULL);
    if (!hdcScreen)
    {
        return E_FAIL;
    }

    HDC hdcMem = CreateCompatibleDC(hdcScreen);
    if (!hdcMem)
    {
        ReleaseDC(NULL, hdcScreen);
        return E_FAIL;
    }

    HBITMAP hbm = CreateCompatibleBitmap(hdcScreen, 64, 64);
    if (!hbm)
    {
        DeleteDC(hdcMem);
        ReleaseDC(NULL, hdcScreen);
        return E_FAIL;
    }

    HGDIOBJ hOld = SelectObject(hdcMem, hbm);

    // Fill background with blue color (like Windows lock screen style)
    HBRUSH hBrush = CreateSolidBrush(RGB(0, 120, 215));
    RECT rect = {0, 0, 64, 64};
    FillRect(hdcMem, &rect, hBrush);
    DeleteObject(hBrush);

    // Draw a simple "key" icon in white
    HPEN hPen = CreatePen(PS_SOLID, 3, RGB(255, 255, 255));
    SelectObject(hdcMem, hPen);
    
    // Draw a circle (key head)
    Ellipse(hdcMem, 16, 16, 40, 40);
    
    // Draw key shaft
    MoveToEx(hdcMem, 36, 28, NULL);
    LineTo(hdcMem, 52, 28);
    
    // Draw key teeth
    MoveToEx(hdcMem, 48, 28, NULL);
    LineTo(hdcMem, 48, 36);
    MoveToEx(hdcMem, 44, 28, NULL);
    LineTo(hdcMem, 44, 34);

    DeleteObject(hPen);
    SelectObject(hdcMem, hOld);
    DeleteDC(hdcMem);
    ReleaseDC(NULL, hdcScreen);

    *phbmp = hbm;
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp)
{
    LogToFile("Credential GetBitmapValue %d", dwFieldID);
    
    if (!phbmp)
    {
        return E_INVALIDARG;
    }
    
    if (dwFieldID != SFI_TILEIMAGE)
    {
        return E_INVALIDARG;
    }
    
    // Create the tile bitmap
    HRESULT hr = CreateTileBitmap(phbmp);
    if (FAILED(hr))
    {
        LogToFile("Credential GetBitmapValue: CreateTileBitmap failed 0x%08X", hr);
        return hr;
    }
    
    LogToFile("Credential GetBitmapValue: SUCCESS");
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetCheckboxValue(DWORD, BOOL*, PWSTR*)
{
    return E_NOTIMPL;
}

IFACEMETHODIMP RemoteDeskCredential::GetSubmitButtonValue(DWORD dwFieldID, DWORD* pdwAdjacentTo)
{
    LogToFile("Credential GetSubmitButtonValue %d", dwFieldID);
    
    if (!pdwAdjacentTo)
    {
        return E_INVALIDARG;
    }
    
    if (dwFieldID == SFI_SUBMIT_BUTTON)
    {
        *pdwAdjacentTo = SFI_PASSWORD;
        return S_OK;
    }
    
    return E_INVALIDARG;
}

IFACEMETHODIMP RemoteDeskCredential::GetComboBoxValueCount(DWORD, DWORD*, DWORD*)
{
    return E_NOTIMPL;
}

IFACEMETHODIMP RemoteDeskCredential::GetComboBoxValueAt(DWORD, DWORD, PWSTR*)
{
    return E_NOTIMPL;
}

IFACEMETHODIMP RemoteDeskCredential::SetStringValue(DWORD dwFieldID, PCWSTR pwz)
{
    LogToFile("Credential SetStringValue %d", dwFieldID);
    
    if (dwFieldID >= SFI_NUM_FIELDS)
    {
        return E_INVALIDARG;
    }
    
    if (_rgFieldStrings[dwFieldID])
    {
        CoTaskMemFree(_rgFieldStrings[dwFieldID]);
        _rgFieldStrings[dwFieldID] = NULL;
    }
    
    if (pwz && wcslen(pwz) > 0)
    {
        HRESULT hr = SHStrDupW(pwz, &_rgFieldStrings[dwFieldID]);
        if (FAILED(hr))
        {
            LogToFile("SetStringValue: SHStrDupW failed 0x%08X", hr);
            return hr;
        }
    }
    
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::SetCheckboxValue(DWORD, BOOL)
{
    return E_NOTIMPL;
}

IFACEMETHODIMP RemoteDeskCredential::SetComboBoxSelectedValue(DWORD, DWORD)
{
    return E_NOTIMPL;
}

IFACEMETHODIMP RemoteDeskCredential::CommandLinkClicked(DWORD)
{
    return E_NOTIMPL;
}

// ---------------------------------------------------------------------------
// Helper: Initialize KERB_INTERACTIVE_UNLOCK_LOGON structure
// ---------------------------------------------------------------------------
static HRESULT KerbInteractiveUnlockLogonInit(
    _In_ PWSTR pszDomain,
    _In_ PWSTR pszUsername,
    _In_ PWSTR pszPassword,
    _Out_ KERB_INTERACTIVE_UNLOCK_LOGON* pkiul)
{
    if (!pszDomain || !pszUsername || !pszPassword || !pkiul)
    {
        LogToFile("KerbInteractiveUnlockLogonInit: NULL parameter error");
        return E_INVALIDARG;
    }

    ZeroMemory(pkiul, sizeof(*pkiul));

    pkiul->Logon.MessageType = KerbInteractiveLogon;

    HRESULT hr = S_OK;

    // Domain
    hr = SHStrDupW(pszDomain, &pkiul->Logon.LogonDomainName.Buffer);
    if (FAILED(hr))
    {
        LogToFile("KerbInteractiveUnlockLogonInit: SHStrDupW domain failed 0x%08X", hr);
        return hr;
    }
    pkiul->Logon.LogonDomainName.Length = (USHORT)(wcslen(pszDomain) * sizeof(WCHAR));
    pkiul->Logon.LogonDomainName.MaximumLength = pkiul->Logon.LogonDomainName.Length + sizeof(WCHAR);

    // Username
    hr = SHStrDupW(pszUsername, &pkiul->Logon.UserName.Buffer);
    if (FAILED(hr))
    {
        LogToFile("KerbInteractiveUnlockLogonInit: SHStrDupW username failed 0x%08X", hr);
        CoTaskMemFree(pkiul->Logon.LogonDomainName.Buffer);
        return hr;
    }
    pkiul->Logon.UserName.Length = (USHORT)(wcslen(pszUsername) * sizeof(WCHAR));
    pkiul->Logon.UserName.MaximumLength = pkiul->Logon.UserName.Length + sizeof(WCHAR);

    // Password
    hr = SHStrDupW(pszPassword, &pkiul->Logon.Password.Buffer);
    if (FAILED(hr))
    {
        LogToFile("KerbInteractiveUnlockLogonInit: SHStrDupW password failed 0x%08X", hr);
        CoTaskMemFree(pkiul->Logon.LogonDomainName.Buffer);
        CoTaskMemFree(pkiul->Logon.UserName.Buffer);
        return hr;
    }
    pkiul->Logon.Password.Length = (USHORT)(wcslen(pszPassword) * sizeof(WCHAR));
    pkiul->Logon.Password.MaximumLength = pkiul->Logon.Password.Length + sizeof(WCHAR);

    return S_OK;
}

// ---------------------------------------------------------------------------
// Helper: Pack KERB_INTERACTIVE_UNLOCK_LOGON into a flat buffer for serialization
// ---------------------------------------------------------------------------
static HRESULT KerbInteractiveUnlockLogonPack(
    _Inout_ KERB_INTERACTIVE_UNLOCK_LOGON* pkiul,
    _Outptr_result_bytebuffer_(*pcb) BYTE** ppb,
    _Out_ DWORD* pcb)
{
    if (!pkiul || !ppb || !pcb)
    {
        LogToFile("KerbInteractiveUnlockLogonPack: NULL parameter error");
        return E_INVALIDARG;
    }

    *ppb = NULL;
    *pcb = 0;

    // Calculate offsets: structure + domain + username + password (including null terminators)
    DWORD cbDomain = pkiul->Logon.LogonDomainName.MaximumLength;
    DWORD cbUser   = pkiul->Logon.UserName.MaximumLength;
    DWORD cbPass   = pkiul->Logon.Password.MaximumLength;
    DWORD cbTotal  = sizeof(KERB_INTERACTIVE_UNLOCK_LOGON) + cbDomain + cbUser + cbPass;

    BYTE* pb = (BYTE*)CoTaskMemAlloc(cbTotal);
    if (!pb)
    {
        LogToFile("KerbInteractiveUnlockLogonPack: CoTaskMemAlloc failed, size=%lu", cbTotal);
        return E_OUTOFMEMORY;
    }

    ZeroMemory(pb, cbTotal);

    // Copy the structure first
    KERB_INTERACTIVE_UNLOCK_LOGON* pkiulOut = (KERB_INTERACTIVE_UNLOCK_LOGON*)pb;
    CopyMemory(pkiulOut, pkiul, sizeof(KERB_INTERACTIVE_UNLOCK_LOGON));

    // Offset where domain data starts
    DWORD dwOffset = sizeof(KERB_INTERACTIVE_UNLOCK_LOGON);

    // Copy Domain
    if (cbDomain > 0)
    {
        CopyMemory(pb + dwOffset, pkiul->Logon.LogonDomainName.Buffer, cbDomain);
        pkiulOut->Logon.LogonDomainName.Buffer = (PWSTR)(ULONG_PTR)dwOffset;
    }
    else
    {
        pkiulOut->Logon.LogonDomainName.Buffer = (PWSTR)(ULONG_PTR)0;
    }
    dwOffset += cbDomain;

    // Copy UserName
    if (cbUser > 0)
    {
        CopyMemory(pb + dwOffset, pkiul->Logon.UserName.Buffer, cbUser);
        pkiulOut->Logon.UserName.Buffer = (PWSTR)(ULONG_PTR)dwOffset;
    }
    else
    {
        pkiulOut->Logon.UserName.Buffer = (PWSTR)(ULONG_PTR)0;
    }
    dwOffset += cbUser;

    // Copy Password
    if (cbPass > 0)
    {
        CopyMemory(pb + dwOffset, pkiul->Logon.Password.Buffer, cbPass);
        pkiulOut->Logon.Password.Buffer = (PWSTR)(ULONG_PTR)dwOffset;
    }
    else
    {
        pkiulOut->Logon.Password.Buffer = (PWSTR)(ULONG_PTR)0;
    }

    *ppb = pb;
    *pcb = cbTotal;

    LogToFile("KerbInteractiveUnlockLogonPack: packed %lu bytes", cbTotal);
    return S_OK;
}

// ---------------------------------------------------------------------------
// Helper: Retrieve the Negotiate authentication package ID from LSA
// ---------------------------------------------------------------------------
static HRESULT RetrieveNegotiateAuthPackage(_Out_ ULONG* pulAuthPackage)
{
    if (!pulAuthPackage)
    {
        LogToFile("RetrieveNegotiateAuthPackage: NULL output parameter");
        return E_INVALIDARG;
    }

    *pulAuthPackage = 0;

    HANDLE hLsa = NULL;
    NTSTATUS status = LsaConnectUntrusted(&hLsa);
    if (status != 0)
    {
        LogToFile("RetrieveNegotiateAuthPackage: LsaConnectUntrusted failed, status=0x%08X", status);
        return HRESULT_FROM_NT(status);
    }

    // Use "Negotiate" authentication package
    // This supports both Kerberos (domain) and NTLM (local)
    LSA_STRING lsaszNegotiatePackage;
    const char* szNegotiate = "Negotiate";
    lsaszNegotiatePackage.Buffer = (PSTR)szNegotiate;
    lsaszNegotiatePackage.Length = (USHORT)strlen(szNegotiate);
    lsaszNegotiatePackage.MaximumLength = lsaszNegotiatePackage.Length + 1;

    ULONG ulAuthPackage = 0;
    status = LsaLookupAuthenticationPackage(hLsa, &lsaszNegotiatePackage, &ulAuthPackage);
    LsaDeregisterLogonProcess(hLsa);

    if (status != 0)
    {
        LogToFile("RetrieveNegotiateAuthPackage: LsaLookupAuthenticationPackage failed, status=0x%08X", status);
        return HRESULT_FROM_NT(status);
    }

    *pulAuthPackage = ulAuthPackage;
    LogToFile("RetrieveNegotiateAuthPackage: authPackage=%lu (Negotiate)", ulAuthPackage);
    return S_OK;
}

// ---------------------------------------------------------------------------
// Helper: Protect password with CredProtectW if not already protected, then copy
// ---------------------------------------------------------------------------
static HRESULT ProtectIfNecessaryAndCopyPassword(
    _In_ PCWSTR pszPassword,
    _Outptr_result_z_ PWSTR* ppszProtectedPassword)
{
    if (!pszPassword || !ppszProtectedPassword)
    {
        LogToFile("ProtectIfNecessaryAndCopyPassword: NULL parameter error");
        return E_INVALIDARG;
    }

    *ppszProtectedPassword = NULL;

    // First, check if the password is already protected
    BOOL bProtected = FALSE;
    HRESULT hr = S_OK;

    // Try CredIsProtectedW to check
    // If it's already protected, just copy it
    // If not, protect it with CredProtectW

    // Determine the required buffer size for the protected password
    DWORD cchProtected = 0;
    // CredProtectW needs non-const input, make a copy
    PWSTR pszPasswordCopy = NULL;
    HRESULT hrCopy = SHStrDupW(pszPassword, &pszPasswordCopy);
    if (FAILED(hrCopy))
    {
        LogToFile("ProtectIfNecessaryAndCopyPassword: SHStrDupW failed");
        return hrCopy;
    }

    if (!CredProtectW(FALSE, pszPasswordCopy, (DWORD)wcslen(pszPasswordCopy) + 1, NULL, &cchProtected, NULL))
    {
        DWORD dwErr = GetLastError();
        if (dwErr != ERROR_INSUFFICIENT_BUFFER)
        {
            CoTaskMemFree(pszPasswordCopy);
            LogToFile("ProtectIfNecessaryAndCopyPassword: CredProtectW size query failed, err=%lu", dwErr);
            hr = SHStrDupW(pszPassword, ppszProtectedPassword);
            if (FAILED(hr))
            {
                LogToFile("ProtectIfNecessaryAndCopyPassword: fallback SHStrDupW failed 0x%08X", hr);
            }
            else
            {
                LogToFile("ProtectIfNecessaryAndCopyPassword: copied password unprotected (fallback)");
            }
            return hr;
        }
    }

    // Allocate buffer for protected password
    PWSTR pszProtected = (PWSTR)CoTaskMemAlloc(cchProtected * sizeof(WCHAR));
    if (!pszProtected)
    {
        CoTaskMemFree(pszPasswordCopy);
        LogToFile("ProtectIfNecessaryAndCopyPassword: CoTaskMemAlloc failed for protected password");
        return E_OUTOFMEMORY;
    }

    CRED_PROTECTION_TYPE protectionType = CredUnprotected;
    if (CredProtectW(FALSE, pszPasswordCopy, (DWORD)wcslen(pszPasswordCopy) + 1, pszProtected, &cchProtected, &protectionType))
    {
        CoTaskMemFree(pszPasswordCopy);
        *ppszProtectedPassword = pszProtected;
        LogToFile("ProtectIfNecessaryAndCopyPassword: password protected successfully");
    }
    else
    {
        DWORD dwErr = GetLastError();
        CoTaskMemFree(pszPasswordCopy);
        CoTaskMemFree(pszProtected);
        LogToFile("ProtectIfNecessaryAndCopyPassword: CredProtectW failed, err=%lu, copying unprotected", dwErr);

        // Fallback: copy unprotected
        hr = SHStrDupW(pszPassword, ppszProtectedPassword);
        if (FAILED(hr))
        {
            LogToFile("ProtectIfNecessaryAndCopyPassword: fallback SHStrDupW failed 0x%08X", hr);
            return hr;
        }
    }

    return S_OK;
}

// ---------------------------------------------------------------------------
// Helper: Extract domain from a "DOMAIN\username" or "username@domain" string
// If no domain is found, returns the local computer name as the domain.
// Caller must CoTaskMemFree the returned domain and username.
// ---------------------------------------------------------------------------
static HRESULT SplitDomainUsername(
    _In_ PCWSTR pszQualifiedUserName,
    _Outptr_result_z_ PWSTR* ppszDomain,
    _Outptr_result_z_ PWSTR* ppszUsername)
{
    if (!pszQualifiedUserName || !ppszDomain || !ppszUsername)
    {
        LogToFile("SplitDomainUsername: NULL parameter error");
        return E_INVALIDARG;
    }

    *ppszDomain = NULL;
    *ppszUsername = NULL;

    PCWSTR pszDomainPart = NULL;
    PCWSTR pszUserPart = NULL;
    size_t cchDomain = 0;
    size_t cchUser = 0;

    // Check for "DOMAIN\username" format
    PCWSTR pszBackslash = wcschr(pszQualifiedUserName, L'\\');
    if (pszBackslash)
    {
        cchDomain = (size_t)(pszBackslash - pszQualifiedUserName);
        pszDomainPart = pszQualifiedUserName;
        pszUserPart = pszBackslash + 1;
        cchUser = wcslen(pszUserPart);
    }
    else
    {
        // Check for "username@domain" format (UPN)
        PCWSTR pszAt = wcschr(pszQualifiedUserName, L'@');
        if (pszAt)
        {
            pszUserPart = pszQualifiedUserName;
            cchUser = (size_t)(pszAt - pszQualifiedUserName);
            pszDomainPart = pszAt + 1;
            cchDomain = wcslen(pszDomainPart);
        }
        else
        {
            // No domain separator - use local computer name as domain
            pszUserPart = pszQualifiedUserName;
            cchUser = wcslen(pszUserPart);
        }
    }

    LogToFile("SplitDomainUsername: parsing qualified name: domain_len=%zu, user_len=%zu", cchDomain, cchUser);

    // Copy username
    PWSTR pszUsernameOut = (PWSTR)CoTaskMemAlloc((cchUser + 1) * sizeof(WCHAR));
    if (!pszUsernameOut)
    {
        LogToFile("SplitDomainUsername: CoTaskMemAlloc for username failed");
        return E_OUTOFMEMORY;
    }
    CopyMemory(pszUsernameOut, pszUserPart, cchUser * sizeof(WCHAR));
    pszUsernameOut[cchUser] = L'\0';
    *ppszUsername = pszUsernameOut;

    // Copy domain or use computer name
    if (pszDomainPart && cchDomain > 0)
    {
        PWSTR pszDomainOut = (PWSTR)CoTaskMemAlloc((cchDomain + 1) * sizeof(WCHAR));
        if (!pszDomainOut)
        {
            LogToFile("SplitDomainUsername: CoTaskMemAlloc for domain failed");
            CoTaskMemFree(pszUsernameOut);
            *ppszUsername = NULL;
            return E_OUTOFMEMORY;
        }
        CopyMemory(pszDomainOut, pszDomainPart, cchDomain * sizeof(WCHAR));
        pszDomainOut[cchDomain] = L'\0';
        *ppszDomain = pszDomainOut;
    }
    else
    {
        // Use local computer name as domain
        DWORD cchComputerName = 0;
        GetComputerNameW(NULL, &cchComputerName);
        cchComputerName++; // Add space for null terminator

        PWSTR pszDomainOut = (PWSTR)CoTaskMemAlloc(cchComputerName * sizeof(WCHAR));
        if (!pszDomainOut)
        {
            CoTaskMemFree(pszUsernameOut);
            *ppszUsername = NULL;
            return E_OUTOFMEMORY;
        }

        DWORD cchSize = cchComputerName;
        if (!GetComputerNameW(pszDomainOut, &cchSize))
        {
            LogToFile("SplitDomainUsername: GetComputerNameW failed, err=%lu", GetLastError());
            CoTaskMemFree(pszDomainOut);
            CoTaskMemFree(pszUsernameOut);
            *ppszUsername = NULL;
            return HRESULT_FROM_WIN32(GetLastError());
        }
        *ppszDomain = pszDomainOut;
    }

    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetSerialization(
    CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr,
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
    PWSTR* ppwszOptionalStatusText,
    CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon)
{
    LogToFile("Credential GetSerialization called!");

    // -----------------------------------------------------------------------
    // 1. Validate and clear all output parameters
    // -----------------------------------------------------------------------
    if (!pcpgsr || !pcpcs)
    {
        LogToFile("GetSerialization: NULL parameter detected");
        return E_INVALIDARG;
    }

    // Always initialize to "not finished" first
    *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
    ZeroMemory(pcpcs, sizeof(*pcpcs));

    if (ppwszOptionalStatusText)
    {
        *ppwszOptionalStatusText = NULL;
    }

    if (pcpsiOptionalStatusIcon)
    {
        *pcpsiOptionalStatusIcon = CPSI_NONE;
    }

    // -----------------------------------------------------------------------
    // 2. First: Try IPC to get credentials from controller (for auto-unlock!)
    // -----------------------------------------------------------------------
    PWSTR pszIpcUsername = NULL;
    PWSTR pszIpcPassword = NULL;
    bool bGotIpcCredentials = false;

    LogToFile("GetSerialization: Try IPC connection first...");

    {
        UnlockIpcClient ipcClient;
        bool bConnected = ipcClient.Connect();
        if (bConnected)
        {
            bool bUnlockRequested = ipcClient.RequestUnlock(&pszIpcUsername, &pszIpcPassword);
            ipcClient.Disconnect();

            if (bUnlockRequested && pszIpcUsername && pszIpcPassword &&
                wcslen(pszIpcUsername) > 0 && wcslen(pszIpcPassword) > 0)
            {
                LogToFile("GetSerialization: Success! IPC gave username=%ls", pszIpcUsername);
                bGotIpcCredentials = true;
            }
            else
            {
                LogToFile("GetSerialization: IPC gave no credentials - OK, we'll use manual input!");
                if (pszIpcUsername) CoTaskMemFree(pszIpcUsername);
                if (pszIpcPassword) CoTaskMemFree(pszIpcPassword);
                pszIpcUsername = NULL;
                pszIpcPassword = NULL;
            }
        }
        else
        {
            LogToFile("GetSerialization: IPC connection failed - RemoteDesk not running? OK, we'll use manual input!");
        }
    }

    // -----------------------------------------------------------------------
    // 3. Second: Use either IPC credentials or manual input
    // -----------------------------------------------------------------------
    PWSTR pszUsername = NULL;
    PWSTR pszPassword = NULL;
    bool bIsUsingIpc = bGotIpcCredentials;  // Save for final log!
    HRESULT hrCopy;

    if (bGotIpcCredentials)
    {
        // Use IPC credentials
        pszUsername = pszIpcUsername;
        pszPassword = pszIpcPassword;
        LogToFile("GetSerialization: Using IPC credentials for auto-unlock");
    }
    else
    {
        // Try user manual input from UI
        bool hasManualUsername = _rgFieldStrings[SFI_USERNAME] && wcslen(_rgFieldStrings[SFI_USERNAME]) > 0;
        bool hasManualPassword = _rgFieldStrings[SFI_PASSWORD] && wcslen(_rgFieldStrings[SFI_PASSWORD]) > 0;

        LogToFile("GetSerialization: Checking manual input: hasUsername=%d, hasPassword=%d", hasManualUsername, hasManualPassword);

        // If we have qualified username from system but no manual input, use it for username field
        if (_pszQualifiedUserName && !hasManualUsername)
        {
            // Split domain and username from qualified name to pre-fill
            PWSTR pszTempDomain = NULL;
            PWSTR pszTempUser = NULL;
            if (SUCCEEDED(SplitDomainUsername(_pszQualifiedUserName, &pszTempDomain, &pszTempUser)))
            {
                LogToFile("GetSerialization: Using username from system: %ls", pszTempUser);
                if (SUCCEEDED(SHStrDupW(pszTempUser, &_rgFieldStrings[SFI_USERNAME])))
                {
                    hasManualUsername = true;
                }
                CoTaskMemFree(pszTempDomain);
                CoTaskMemFree(pszTempUser);
            }
        }

        if (!hasManualUsername)
        {
            LogToFile("GetSerialization: No username - please enter!");
            *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
            if (ppwszOptionalStatusText)
            {
                SHStrDupW(L"Please enter username", ppwszOptionalStatusText);
            }
            if (pcpsiOptionalStatusIcon)
            {
                *pcpsiOptionalStatusIcon = CPSI_WARNING;
            }
            return S_OK;
        }

        if (!hasManualPassword)
        {
            LogToFile("GetSerialization: No password - please enter!");
            *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
            if (ppwszOptionalStatusText)
            {
                SHStrDupW(L"Please enter password", ppwszOptionalStatusText);
            }
            if (pcpsiOptionalStatusIcon)
            {
                *pcpsiOptionalStatusIcon = CPSI_WARNING;
            }
            return S_OK;
        }

        LogToFile("GetSerialization: Manual credentials available - username: %ls", _rgFieldStrings[SFI_USERNAME]);

        // For manual input, ALWAYS use what the user typed
        // This allows users to enter any username they want
        hrCopy = SHStrDupW(_rgFieldStrings[SFI_USERNAME], &pszUsername);
        if (FAILED(hrCopy) || !pszUsername)
        {
            LogToFile("GetSerialization: Copy username failed!");
            *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
            return S_OK;
        }
        LogToFile("GetSerialization: Using user-entered username: %ls", pszUsername);

        hrCopy = SHStrDupW(_rgFieldStrings[SFI_PASSWORD], &pszPassword);
        if (FAILED(hrCopy) || !pszPassword)
        {
            LogToFile("GetSerialization: Copy password failed!");
            CoTaskMemFree(pszUsername);
            *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
            return S_OK;
        }

        LogToFile("GetSerialization: Using manual credentials: %ls", pszUsername);
    }

    // -----------------------------------------------------------------------
    // 4. Split domain\username or username@domain, or use computer name
    // -----------------------------------------------------------------------
    PWSTR pszDomain = NULL;
    PWSTR pszSimpleUsername = NULL;
    HRESULT hrSplit = SplitDomainUsername(pszUsername, &pszDomain, &pszSimpleUsername);
    if (FAILED(hrSplit) || !pszDomain || !pszSimpleUsername)
    {
        LogToFile("GetSerialization: SplitDomainUsername failed 0x%08X", hrSplit);
        CoTaskMemFree(pszUsername);
        CoTaskMemFree(pszPassword);
        if (pszDomain) CoTaskMemFree(pszDomain);
        if (pszSimpleUsername) CoTaskMemFree(pszSimpleUsername);
        *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
        if (ppwszOptionalStatusText)
        {
            SHStrDupW(L"Failed to parse username", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
        return S_OK;
    }

    LogToFile("GetSerialization: domain=%ls, username=%ls", pszDomain, pszSimpleUsername);

    // -----------------------------------------------------------------------
    // 5. Protect the password
    // -----------------------------------------------------------------------
    PWSTR pszProtectedPassword = NULL;
    HRESULT hrProtect = ProtectIfNecessaryAndCopyPassword(pszPassword, &pszProtectedPassword);
    if (FAILED(hrProtect) || !pszProtectedPassword)
    {
        LogToFile("GetSerialization: ProtectIfNecessaryAndCopyPassword failed 0x%08X", hrProtect);
        CoTaskMemFree(pszUsername);
        CoTaskMemFree(pszPassword);
        CoTaskMemFree(pszDomain);
        CoTaskMemFree(pszSimpleUsername);
        *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
        if (ppwszOptionalStatusText)
        {
            SHStrDupW(L"Failed to protect password", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
        return S_OK;
    }

    // Free the original password (already copied/protected)
    CoTaskMemFree(pszPassword);

    // -----------------------------------------------------------------------
    // 6. Initialize KERB_INTERACTIVE_UNLOCK_LOGON
    // -----------------------------------------------------------------------
    KERB_INTERACTIVE_UNLOCK_LOGON kiul;
    ZeroMemory(&kiul, sizeof(kiul));
    HRESULT hrKerb = KerbInteractiveUnlockLogonInit(pszDomain, pszSimpleUsername, pszProtectedPassword, &kiul);
    if (FAILED(hrKerb))
    {
        LogToFile("GetSerialization: KerbInteractiveUnlockLogonInit failed 0x%08X", hrKerb);
        CoTaskMemFree(pszUsername);
        CoTaskMemFree(pszDomain);
        CoTaskMemFree(pszSimpleUsername);
        CoTaskMemFree(pszProtectedPassword);
        *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
        if (ppwszOptionalStatusText)
        {
            SHStrDupW(L"Failed to prepare credentials", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
        return S_OK;
    }

    // -----------------------------------------------------------------------
    // 7. Pack into flat buffer
    // -----------------------------------------------------------------------
    BYTE* pbAuthBuffer = NULL;
    DWORD cbAuthBuffer = 0;
    HRESULT hrPack = KerbInteractiveUnlockLogonPack(&kiul, &pbAuthBuffer, &cbAuthBuffer);
    if (FAILED(hrPack) || !pbAuthBuffer)
    {
        LogToFile("GetSerialization: KerbInteractiveUnlockLogonPack failed 0x%08X", hrPack);
        CoTaskMemFree(kiul.Logon.LogonDomainName.Buffer);
        CoTaskMemFree(kiul.Logon.UserName.Buffer);
        CoTaskMemFree(kiul.Logon.Password.Buffer);
        CoTaskMemFree(pszUsername);
        CoTaskMemFree(pszDomain);
        CoTaskMemFree(pszSimpleUsername);
        CoTaskMemFree(pszProtectedPassword);
        *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
        if (ppwszOptionalStatusText)
        {
            SHStrDupW(L"Failed to package credentials", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
        return S_OK;
    }

    // Free the KERB string buffers (they've been copied into the flat buffer)
    CoTaskMemFree(kiul.Logon.LogonDomainName.Buffer);
    CoTaskMemFree(kiul.Logon.UserName.Buffer);
    CoTaskMemFree(kiul.Logon.Password.Buffer);

    // -----------------------------------------------------------------------
    // 8. Retrieve the Negotiate (Kerberos) authentication package
    // -----------------------------------------------------------------------
    ULONG ulAuthPackage = 0;
    HRESULT hrAuth = RetrieveNegotiateAuthPackage(&ulAuthPackage);
    if (FAILED(hrAuth))
    {
        LogToFile("GetSerialization: RetrieveNegotiateAuthPackage failed 0x%08X", hrAuth);
        CoTaskMemFree(pbAuthBuffer);
        CoTaskMemFree(pszUsername);
        CoTaskMemFree(pszDomain);
        CoTaskMemFree(pszSimpleUsername);
        CoTaskMemFree(pszProtectedPassword);
        *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
        if (ppwszOptionalStatusText)
        {
            SHStrDupW(L"Failed to retrieve authentication package", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
        return S_OK;
    }

    // -----------------------------------------------------------------------
    // 9. Fill the serialization structure
    // -----------------------------------------------------------------------
    pcpcs->ulAuthenticationPackage = ulAuthPackage;
    pcpcs->clsidCredentialProvider = CLSID_RemoteDeskCredentialProvider;
    pcpcs->cbSerialization = cbAuthBuffer;
    pcpcs->rgbSerialization = pbAuthBuffer;

    // Return CPGSR_RETURN_CREDENTIAL_FINISHED - we have credentials to submit
    *pcpgsr = CPGSR_RETURN_CREDENTIAL_FINISHED;

    LogToFile("GetSerialization: SUCCESS - returning serialized credentials (authPkg=%lu, cb=%lu, source=%s)",
              ulAuthPackage, cbAuthBuffer, bIsUsingIpc ? "IPC-AUTO-UNLOCK" : "USER-MANUAL-INPUT");

    // Clean up temporary strings (pbAuthBuffer is now owned by pcpcs->rgbSerialization)
    CoTaskMemFree(pszUsername);
    CoTaskMemFree(pszDomain);
    CoTaskMemFree(pszSimpleUsername);
    CoTaskMemFree(pszProtectedPassword);

    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::ReportResult(
    NTSTATUS ntsStatus, 
    NTSTATUS ntsSubstatus, 
    PWSTR* ppwszOptionalStatusText, 
    CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon)
{
    LogToFile("Credential ReportResult: Status=0x%08X, Substatus=0x%08X", ntsStatus, ntsSubstatus);
    
    // Only show error if status is not success!
    if (ntsStatus != 0)
    {
        LogToFile("Credential ReportResult: Login FAILED!");
        
        // Provide user-friendly error message
        if (ppwszOptionalStatusText)
        {
            SHStrDupW(L"Login failed. Please use Windows default login.", ppwszOptionalStatusText);
        }
        
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
    }
    else
    {
        LogToFile("Credential ReportResult: Login SUCCESS!");
        
        // No error message needed!
        if (ppwszOptionalStatusText)
        {
            *ppwszOptionalStatusText = NULL;
        }
        
        if (pcpsiOptionalStatusIcon)
        {
            *pcpsiOptionalStatusIcon = CPSI_NONE;
        }
    }
    
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetUserSid(PWSTR* ppszSid)
{
    LogToFile("Credential GetUserSid");
    
    if (!ppszSid)
    {
        return E_INVALIDARG;
    }
    
    *ppszSid = NULL;
    
    // First try to use stored SID
    if (_pszUserSid)
    {
        HRESULT hr = SHStrDupW(_pszUserSid, ppszSid);
        if (SUCCEEDED(hr) && *ppszSid)
        {
            LogToFile("Credential GetUserSid: returning stored SID: %ls", *ppszSid);
            return hr;
        }
    }
    
    // If no SID available, try to get it from username
    // This is needed for manual input to work properly
    if (_rgFieldStrings[SFI_USERNAME] && wcslen(_rgFieldStrings[SFI_USERNAME]) > 0)
    {
        LogToFile("Credential GetUserSid: trying to get SID from username");
        
        PWSTR pszUsername = _rgFieldStrings[SFI_USERNAME];
        PWSTR pszDomain = NULL;
        PWSTR pszSimpleUsername = NULL;
        
        // Split domain and username
        HRESULT hr = SplitDomainUsername(pszUsername, &pszDomain, &pszSimpleUsername);
        if (SUCCEEDED(hr) && pszDomain && pszSimpleUsername)
        {
            LogToFile("Credential GetUserSid: domain=%ls, username=%ls", pszDomain, pszSimpleUsername);
            
            // Try to lookup the user SID
            SID_NAME_USE sidUse;
            DWORD cbSid = 0;
            DWORD cchReferencedDomain = 0;
            
            // First call to get required buffer sizes
            if (!LookupAccountNameW(pszDomain, pszSimpleUsername, NULL, &cbSid, NULL, &cchReferencedDomain, &sidUse))
            {
                DWORD dwError = GetLastError();
                LogToFile("Credential GetUserSid: LookupAccountNameW size query, error=%lu, cbSid=%lu, cchDomain=%lu", 
                         dwError, cbSid, cchReferencedDomain);
                
                if (dwError == ERROR_INSUFFICIENT_BUFFER || dwError == ERROR_NONE_MAPPED)
                {
                    if (cbSid > 0)
                    {
                        PSID pSid = (PSID)LocalAlloc(LMEM_FIXED, cbSid);
                        if (pSid)
                        {
                            PWSTR pszReferencedDomain = (PWSTR)LocalAlloc(LMEM_FIXED, cchReferencedDomain * sizeof(WCHAR));
                            if (pszReferencedDomain)
                            {
                                if (LookupAccountNameW(pszDomain, pszSimpleUsername, pSid, &cbSid, pszReferencedDomain, &cchReferencedDomain, &sidUse))
                                {
                                    // Convert SID to string
                                    PWSTR pszStringSid = NULL;
                                    if (ConvertSidToStringSidW(pSid, &pszStringSid))
                                    {
                                        HRESULT hrSid = SHStrDupW(pszStringSid, ppszSid);
                                        if (SUCCEEDED(hrSid))
                                        {
                                            LogToFile("Credential GetUserSid: got SID from username: %ls", *ppszSid);
                                            
                                            // Also store it for later use
                                            if (_pszUserSid) CoTaskMemFree(_pszUserSid);
                                            _pszUserSid = NULL;
                                            SHStrDupW(pszStringSid, &_pszUserSid);
                                        }
                                        LocalFree(pszStringSid);
                                        LocalFree(pszReferencedDomain);
                                        LocalFree(pSid);
                                        CoTaskMemFree(pszDomain);
                                        CoTaskMemFree(pszSimpleUsername);
                                        return hrSid;
                                    }
                                    else
                                    {
                                        LogToFile("Credential GetUserSid: ConvertSidToStringSidW failed, error=%lu", GetLastError());
                                    }
                                }
                                else
                                {
                                    LogToFile("Credential GetUserSid: LookupAccountNameW second call failed, error=%lu", GetLastError());
                                }
                                LocalFree(pszReferencedDomain);
                            }
                            LocalFree(pSid);
                        }
                    }
                    else
                    {
                        LogToFile("Credential GetUserSid: cbSid is 0, cannot lookup");
                    }
                }
                else
                {
                    LogToFile("Credential GetUserSid: LookupAccountNameW failed, error=%lu", dwError);
                }
            }
            else
            {
                LogToFile("Credential GetUserSid: LookupAccountNameW first call unexpectedly succeeded");
            }
            
            CoTaskMemFree(pszDomain);
            CoTaskMemFree(pszSimpleUsername);
        }
        else
        {
            LogToFile("Credential GetUserSid: SplitDomainUsername failed or returned null");
        }
    }
    else
    {
        LogToFile("Credential GetUserSid: no username in field strings");
    }
    
    LogToFile("Credential GetUserSid: returning NULL SID");
    return S_OK;
}

IFACEMETHODIMP RemoteDeskCredential::GetFieldOptions(DWORD, CREDENTIAL_PROVIDER_CREDENTIAL_FIELD_OPTIONS*)
{
    return E_NOTIMPL;
}

class RemoteDeskCredentialProviderFactory : public IClassFactory
{
public:
    RemoteDeskCredentialProviderFactory() : _cRef(1) { }

    IFACEMETHODIMP_(ULONG) AddRef() { return InterlockedIncrement(&_cRef); }
    IFACEMETHODIMP_(ULONG) Release()
    {
        LONG cRef = InterlockedDecrement(&_cRef);
        if (!cRef)
            delete this;
        return cRef;
    }
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv)
    {
        static const QITAB qit[] =
        {
            QITABENT(RemoteDeskCredentialProviderFactory, IClassFactory),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }
    IFACEMETHODIMP CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppv)
    {
        HRESULT hr = CLASS_E_NOAGGREGATION;
        if (!pUnkOuter)
        {
            RemoteDeskCredentialProvider* pProvider = new RemoteDeskCredentialProvider();
            if (pProvider)
            {
                hr = pProvider->QueryInterface(riid, ppv);
                pProvider->Release();
            }
            else
            {
                hr = E_OUTOFMEMORY;
            }
        }
        return hr;
    }
    IFACEMETHODIMP LockServer(BOOL fLock)
    {
        if (fLock)
            g_cRefDll++;
        else
            g_cRefDll--;
        return S_OK;
    }
private:
    ~RemoteDeskCredentialProviderFactory() { }
    LONG _cRef;
};

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID)
{
    if (ul_reason_for_call == DLL_PROCESS_ATTACH)
    {
        g_hinst = hModule;
    }
    return TRUE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv)
{
    LogToFile("DllGetClassObject");
    HRESULT hr = E_OUTOFMEMORY;
    *ppv = NULL;
    if (IsEqualGUID(rclsid, CLSID_RemoteDeskCredentialProvider))
    {
        RemoteDeskCredentialProviderFactory* pFactory = new RemoteDeskCredentialProviderFactory();
        if (pFactory)
        {
            hr = pFactory->QueryInterface(riid, ppv);
            pFactory->Release();
        }
    }
    else
    {
        hr = CLASS_E_CLASSNOTAVAILABLE;
    }
    LogToFile("DllGetClassObject hr=0x%08X", hr);
    return hr;
}

STDAPI DllCanUnloadNow()
{
    return (g_cRefDll == 0) ? S_OK : S_FALSE;
}

STDAPI DllRegisterServer()
{
    WCHAR szModule[MAX_PATH];
    GetModuleFileNameW(g_hinst, szModule, ARRAYSIZE(szModule));
    WCHAR szCLSID[64];
    StringFromGUID2(CLSID_RemoteDeskCredentialProvider, szCLSID, ARRAYSIZE(szCLSID));
    WCHAR szKey[256];
    StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"CLSID\\%s", szCLSID);
    HKEY hKey;

    if (RegCreateKeyExW(HKEY_LOCAL_MACHINE, szKey, 0, NULL, 0, KEY_WRITE, NULL, &hKey, NULL) == ERROR_SUCCESS)
    {
        RegSetValueExW(hKey, NULL, 0, REG_SZ, (const BYTE*)L"RemoteDesk Credential Provider", (DWORD)((wcslen(L"RemoteDesk Credential Provider") + 1) * sizeof(WCHAR)));
        HKEY hSubkey;
        if (RegCreateKeyExW(hKey, L"InprocServer32", 0, NULL, 0, KEY_WRITE, NULL, &hSubkey, NULL) == ERROR_SUCCESS)
        {
            RegSetValueExW(hSubkey, NULL, 0, REG_SZ, (const BYTE*)szModule, (DWORD)((wcslen(szModule) + 1) * sizeof(WCHAR)));
            RegSetValueExW(hSubkey, L"ThreadingModel", 0, REG_SZ, (const BYTE*)L"Apartment", (DWORD)((wcslen(L"Apartment") + 1) * sizeof(WCHAR)));
            RegCloseKey(hSubkey);
        }
        RegCloseKey(hKey);

        StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\%s", szCLSID);
        if (RegCreateKeyExW(HKEY_LOCAL_MACHINE, szKey, 0, NULL, 0, KEY_WRITE, NULL, &hKey, NULL) == ERROR_SUCCESS)
        {
            RegSetValueExW(hKey, NULL, 0, REG_SZ, (const BYTE*)L"RemoteDesk Credential Provider", (DWORD)((wcslen(L"RemoteDesk Credential Provider") + 1) * sizeof(WCHAR)));
            RegCloseKey(hKey);
        }
    }
    return S_OK;
}

STDAPI DllUnregisterServer()
{
    WCHAR szCLSID[64];
    StringFromGUID2(CLSID_RemoteDeskCredentialProvider, szCLSID, ARRAYSIZE(szCLSID));
    WCHAR szKey[256];
    StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"CLSID\\%s", szCLSID);
    RegDeleteTreeW(HKEY_LOCAL_MACHINE, szKey);

    StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\%s", szCLSID);
    RegDeleteTreeW(HKEY_LOCAL_MACHINE, szKey);
    return S_OK;
}

