
#include "YCDeskCredentialProvider.h"
#include <stdio.h>
#include <time.h>
#include <string>
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif
#include <wincred.h>

LONG g_cRefDll = 0;
HMODULE g_hinst = NULL;

const GUID CLSID_YCDeskCredentialProvider = {
    0xA1B2C3D4, 0xE5F6, 0x7890, { 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90 }
};

static void LogToFile(const char* format, ...) {
    char buffer[4096];
    va_list args;
    va_start(args, format);
    vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);

    wchar_t logPath[MAX_PATH] = {};
    HKEY hKey = NULL;
    bool useRegistryPathFound = false;

    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\YCDesk", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
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

    wcscat_s(logPath, MAX_PATH, L"\\ycdesk_cred_provider.log");

    FILE* f = NULL;
    errno_t err = _wfopen_s(&f, logPath, L"a");
    if (f) {
        time_t now = time(NULL);
        struct tm tmInfo;
        localtime_s(&tmInfo, &now);
        fwprintf(f, L"[%04d-%02d-%02d %02d:%02d:%02d] %S\n",
            tmInfo.tm_year + 1900, tmInfo.tm_mon + 1, tmInfo.tm_mday,
            tmInfo.tm_hour, tmInfo.tm_min, tmInfo.tm_sec, buffer);
        fclose(f);
    }
}

// ========== UnlockIpcClient Implementation ==========
UnlockIpcClient::UnlockIpcClient() : _hPipe(INVALID_HANDLE_VALUE) {
}

UnlockIpcClient::~UnlockIpcClient() {
    Disconnect();
}

bool UnlockIpcClient::Connect() {
    if (_hPipe != INVALID_HANDLE_VALUE) {
        return true;
    }

    _hPipe = CreateFileW(
        L"\\\\.\\pipe\\YCDeskUnlock",
        GENERIC_READ | GENERIC_WRITE,
        0, NULL, OPEN_EXISTING, 0, NULL
    );

    if (_hPipe == INVALID_HANDLE_VALUE) {
        DWORD dwError = GetLastError();
        LogToFile("IPC Connect failed: %lu", dwError);
        return false;
    }

    DWORD dwMode = PIPE_READMODE_MESSAGE;
    if (!SetNamedPipeHandleState(_hPipe, &dwMode, NULL, NULL)) {
        LogToFile("IPC SetNamedPipeHandleState failed: %lu", GetLastError());
        CloseHandle(_hPipe);
        _hPipe = INVALID_HANDLE_VALUE;
        return false;
    }

    LogToFile("IPC Connected");
    return true;
}

bool UnlockIpcClient::Disconnect() {
    if (_hPipe != INVALID_HANDLE_VALUE) {
        CloseHandle(_hPipe);
        _hPipe = INVALID_HANDLE_VALUE;
        LogToFile("IPC Disconnected");
    }
    return true;
}

bool UnlockIpcClient::RequestUnlock(_Outptr_result_z_ PWSTR* ppszUsername, _Outptr_result_z_ PWSTR* ppszPassword) {
    *ppszUsername = NULL;
    *ppszPassword = NULL;

    if (_hPipe == INVALID_HANDLE_VALUE) {
        LogToFile("IPC RequestUnlock: not connected");
        return false;
    }

    const wchar_t* request = L"REQUEST_UNLOCK";
    DWORD bytesWritten = 0;
    if (!WriteFile(_hPipe, request, (DWORD)(wcslen(request) + 1) * sizeof(wchar_t), &bytesWritten, NULL)) {
        LogToFile("IPC RequestUnlock: WriteFile failed: %lu", GetLastError());
        return false;
    }

    wchar_t buffer[4096] = {};
    DWORD bytesRead = 0;
    if (!ReadFile(_hPipe, buffer, sizeof(buffer) - sizeof(wchar_t), &bytesRead, NULL)) {
        LogToFile("IPC RequestUnlock: ReadFile failed: %lu", GetLastError());
        return false;
    }

    if (bytesRead == 0 || buffer[0] == L'\0') {
        LogToFile("IPC RequestUnlock: no credentials available");
        return false;
    }

    size_t usernameLen = wcslen(buffer);
    if (usernameLen == 0) {
        LogToFile("IPC RequestUnlock: empty username");
        return false;
    }

    const wchar_t* password = buffer + usernameLen + 1;
    size_t passwordLen = wcslen(password);

    *ppszUsername = (PWSTR)CoTaskMemAlloc((usernameLen + 1) * sizeof(wchar_t));
    if (!*ppszUsername) {
        LogToFile("IPC RequestUnlock: CoTaskMemAlloc failed for username");
        return false;
    }
    CopyMemory(*ppszUsername, buffer, (usernameLen + 1) * sizeof(wchar_t));

    *ppszPassword = (PWSTR)CoTaskMemAlloc((passwordLen + 1) * sizeof(wchar_t));
    if (!*ppszPassword) {
        CoTaskMemFree(*ppszUsername);
        *ppszUsername = NULL;
        LogToFile("IPC RequestUnlock: CoTaskMemAlloc failed for password");
        return false;
    }
    CopyMemory(*ppszPassword, password, (passwordLen + 1) * sizeof(wchar_t));

    LogToFile("IPC RequestUnlock: got credentials (username=%ls, password_len=%zu)", *ppszUsername, passwordLen);
    return true;
}

// ========== YCDeskCredentialProvider ==========
YCDeskCredentialProvider::YCDeskCredentialProvider()
    : _cRef(1), _pcpe(NULL), _upAdviseContext(0), _cpus(CPUS_INVALID), _pCredProviderUserArray(NULL), _bUnlockRequested(false), _hUnlockPollTimer(NULL), _bUnlockNotified(false) {
    LogToFile("YCDeskProvider created");
    g_cRefDll++;
}

YCDeskCredentialProvider::~YCDeskCredentialProvider() {
    LogToFile("YCDeskProvider destroyed");
    _CleanupCredentials();

    if (_pCredProviderUserArray) {
        _pCredProviderUserArray->Release();
        _pCredProviderUserArray = NULL;
    }
    g_cRefDll--;
}

IFACEMETHODIMP_(ULONG) YCDeskCredentialProvider::AddRef() {
    return InterlockedIncrement(&_cRef);
}

IFACEMETHODIMP_(ULONG) YCDeskCredentialProvider::Release() {
    LONG cRef = InterlockedDecrement(&_cRef);
    if (!cRef)
        delete this;
    return cRef;
}

IFACEMETHODIMP YCDeskCredentialProvider::QueryInterface(REFIID riid, void** ppv) {
    static const QITAB qitab[] = {
        QITABENT(YCDeskCredentialProvider, ICredentialProvider),
        QITABENT(YCDeskCredentialProvider, ICredentialProviderSetUserArray),
        { 0 },
    };

    HRESULT hr = QISearch(this, qitab, riid, ppv);

    LPOLESTR pszIID = NULL;
    if (SUCCEEDED(StringFromIID(riid, &pszIID))) {
        LogToFile("Provider QueryInterface: %ls, hr=0x%08X", pszIID, hr);
        CoTaskMemFree(pszIID);
    }

    return hr;
}

IFACEMETHODIMP YCDeskCredentialProvider::SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, DWORD) {
    LogToFile("Provider SetUsageScenario: %d", cpus);
    _cpus = cpus;

    _CleanupCredentials();
    _EnumerateCredentials();

    LogToFile("Provider SetUsageScenario: Complete, credential count = %zu", _rgpCredentials.size());
    return S_OK;
}

IFACEMETHODIMP YCDeskCredentialProvider::SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION*) {
    LogToFile("Provider SetSerialization");
    return S_OK;
}

IFACEMETHODIMP YCDeskCredentialProvider::Advise(ICredentialProviderEvents* pcpe, UINT_PTR upAdviseContext) {
    LogToFile("Provider Advise");
    _pcpe = pcpe;
    if (_pcpe)
        _pcpe->AddRef();
    _upAdviseContext = upAdviseContext;
    _bUnlockNotified = false;

    CreateTimerQueueTimer(&_hUnlockPollTimer, NULL, _UnlockPollTimerCallback, this, 1000, 1000, WT_EXECUTEDEFAULT);
    LogToFile("Provider Advise: poll timer started");
    return S_OK;
}

IFACEMETHODIMP YCDeskCredentialProvider::UnAdvise() {
    LogToFile("Provider UnAdvise");
    if (_hUnlockPollTimer) {
        DeleteTimerQueueTimer(NULL, _hUnlockPollTimer, NULL);
        _hUnlockPollTimer = NULL;
    }
    if (_pcpe) {
        _pcpe->Release();
        _pcpe = NULL;
    }
    return S_OK;
}

VOID CALLBACK YCDeskCredentialProvider::_UnlockPollTimerCallback(PVOID lpParam, BOOLEAN TimerOrWaitFired) {
    YCDeskCredentialProvider* pProvider = (YCDeskCredentialProvider*)lpParam;
    if (pProvider) {
        pProvider->CheckUnlockFlag();
    }
}

void YCDeskCredentialProvider::CheckUnlockFlag() {
    if (_bUnlockNotified)
        return;

    HANDLE hFlag = CreateFileW(
        L"C:\\ProgramData\\YCDesk\\unlock_ready.flag",
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    if (hFlag != INVALID_HANDLE_VALUE) {
        char buf[64] = {0};
        DWORD bytesRead = 0;
        if (ReadFile(hFlag, buf, sizeof(buf) - 1, &bytesRead, NULL) && bytesRead > 0) {
            buf[bytesRead] = 0;
            __int64 flagTime = _atoi64(buf);
            FILETIME ft;
            GetSystemTimeAsFileTime(&ft);
            ULARGE_INTEGER uli;
            uli.LowPart = ft.dwLowDateTime;
            uli.HighPart = ft.dwHighDateTime;
            __int64 nowMillis = (uli.QuadPart / 10000ULL) - 11644473600000ULL;
            __int64 elapsedMs = nowMillis - flagTime;

            if (elapsedMs >= 0 && elapsedMs < 60000) {
                LogToFile("CheckUnlockFlag: flag found, elapsed=%lldms, triggering CredentialsChanged", elapsedMs);
                _bUnlockNotified = true;
                _bUnlockRequested = true;
                if (_pcpe) {
                    _pcpe->CredentialsChanged(_upAdviseContext);
                }
            }
        }
        CloseHandle(hFlag);
    }
}

IFACEMETHODIMP YCDeskCredentialProvider::GetFieldDescriptorCount(DWORD* pdwCount) {
    LogToFile("Provider GetFieldDescriptorCount");
    if (!pdwCount) {
        return E_INVALIDARG;
    }
    *pdwCount = YCDFI_NUM_FIELDS;
    return S_OK;
}

IFACEMETHODIMP YCDeskCredentialProvider::GetFieldDescriptorAt(DWORD dwIndex, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd) {
    LogToFile("Provider GetFieldDescriptorAt, index=%lu", dwIndex);

    if (!ppcpfd) {
        return E_INVALIDARG;
    }

    if (dwIndex >= YCDFI_NUM_FIELDS) {
        return E_INVALIDARG;
    }

    *ppcpfd = NULL;

    CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR cpfd;
    ZeroMemory(&cpfd, sizeof(cpfd));
    cpfd.dwFieldID = dwIndex;

    PWSTR pszLabel = NULL;
    switch (dwIndex) {
    case YCDFI_TILEIMAGE:
        cpfd.cpft = CPFT_TILE_IMAGE;
        pszLabel = L"YCDesk";
        break;
    case YCDFI_LARGETEXT:
        cpfd.cpft = CPFT_LARGE_TEXT;
        pszLabel = L"YCDesk";
        break;
    case YCDFI_SMALLTEXT:
        cpfd.cpft = CPFT_SMALL_TEXT;
        pszLabel = L"Remote Desktop Unlock";
        break;
    case YCDFI_USERNAME:
        cpfd.cpft = CPFT_EDIT_TEXT;
        pszLabel = L"Username";
        break;
    case YCDFI_PASSWORD:
        cpfd.cpft = CPFT_PASSWORD_TEXT;
        pszLabel = L"Password";
        break;
    case YCDFI_SUBMIT_BUTTON:
        cpfd.cpft = CPFT_SUBMIT_BUTTON;
        pszLabel = L"Sign in";
        break;
    default:
        return E_INVALIDARG;
    }

    HRESULT hr = SHStrDupW(pszLabel, &cpfd.pszLabel);
    if (FAILED(hr)) {
        return hr;
    }

    *ppcpfd = (CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR*)CoTaskMemAlloc(sizeof(CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR));
    if (!*ppcpfd) {
        CoTaskMemFree(cpfd.pszLabel);
        return E_OUTOFMEMORY;
    }

    CopyMemory(*ppcpfd, &cpfd, sizeof(cpfd));
    LogToFile("Provider GetFieldDescriptorAt success for field %lu", dwIndex);
    return S_OK;
}

IFACEMETHODIMP YCDeskCredentialProvider::GetCredentialCount(DWORD* pdwCount, DWORD* pdwDefault, BOOL* pbAutoLogonWithDefault) {
    LogToFile("Provider GetCredentialCount");

    if (_rgpCredentials.empty()) {
        _EnumerateCredentials();
    }

    *pdwCount = static_cast<DWORD>(_rgpCredentials.size());
    *pdwDefault = CREDENTIAL_PROVIDER_NO_DEFAULT;
    *pbAutoLogonWithDefault = FALSE;

    // Check if unlock was recently requested via IPC
    // Read the flag file written by UnlockIpcServer.setCredentials()
    HANDLE hFlag = CreateFileW(
        L"C:\\ProgramData\\YCDesk\\unlock_ready.flag",
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    if (hFlag != INVALID_HANDLE_VALUE) {
        char buf[64] = {0};
        DWORD bytesRead = 0;
        if (ReadFile(hFlag, buf, sizeof(buf) - 1, &bytesRead, NULL) && bytesRead > 0) {
            buf[bytesRead] = 0;
            __int64 flagTime = _atoi64(buf);
            FILETIME ft;
            GetSystemTimeAsFileTime(&ft);
            ULARGE_INTEGER uli;
            uli.LowPart = ft.dwLowDateTime;
            uli.HighPart = ft.dwHighDateTime;
            __int64 nowMillis = (uli.QuadPart / 10000ULL) - 11644473600000ULL;
            __int64 elapsedMs = nowMillis - flagTime;

            LogToFile("Provider GetCredentialCount: flag exists, elapsed=%lldms", elapsedMs);

            if (elapsedMs >= 0 && elapsedMs < 60000) {  // Flag is fresh (within 60 seconds)
                LogToFile("Provider GetCredentialCount: Unlock requested! Setting auto-logon=TRUE");
                *pdwDefault = 0;  // Select our first credential
                *pbAutoLogonWithDefault = TRUE;
                _bUnlockRequested = true;
            } else {
                LogToFile("Provider GetCredentialCount: flag too old, ignoring");
            }
        }
        CloseHandle(hFlag);
    } else {
        LogToFile("Provider GetCredentialCount: no unlock flag (%lu)", GetLastError());
    }

    LogToFile("Provider GetCredentialCount = %lu, auto=%d", *pdwCount, *pbAutoLogonWithDefault);

    return S_OK;
}

IFACEMETHODIMP YCDeskCredentialProvider::GetCredentialAt(DWORD dwIndex, ICredentialProviderCredential** ppcpc) {
    *ppcpc = NULL;
    HRESULT hr = E_INVALIDARG;

    LogToFile("Provider GetCredentialAt %lu", dwIndex);

    if (dwIndex < _rgpCredentials.size()) {
        *ppcpc = _rgpCredentials[dwIndex];
        (*ppcpc)->AddRef();
        hr = S_OK;
        LogToFile("Provider GetCredentialAt success");
    }
    return hr;
}

IFACEMETHODIMP YCDeskCredentialProvider::SetUserArray(ICredentialProviderUserArray* users) {
    LogToFile("Provider SetUserArray called");

    if (_pCredProviderUserArray) {
        _pCredProviderUserArray->Release();
        _pCredProviderUserArray = NULL;
    }

    _pCredProviderUserArray = users;
    if (_pCredProviderUserArray) {
        _pCredProviderUserArray->AddRef();
    }

    _CleanupCredentials();
    _EnumerateCredentials();
    return S_OK;
}

HRESULT YCDeskCredentialProvider::_EnumerateCredentials() {
    LogToFile("Provider EnumerateCredentials");

    _CleanupCredentials();

    YCDeskCredential* pCredential = new YCDeskCredential(this);
    if (pCredential) {
        HRESULT hr = pCredential->Initialize(_cpus, NULL);
        if (SUCCEEDED(hr)) {
            _rgpCredentials.push_back(pCredential);
            LogToFile("Provider Enumerate: Added 1 credential");
        } else {
            delete pCredential;
        }
    }

    return S_OK;
}

HRESULT YCDeskCredentialProvider::_CleanupCredentials() {
    for (auto cred : _rgpCredentials) {
        cred->Release();
    }
    _rgpCredentials.clear();
    return S_OK;
}

// ========== YCDeskCredential ==========
YCDeskCredential::YCDeskCredential(YCDeskCredentialProvider* pProvider)
    : _cRef(1), _pProvider(pProvider), _cpus(CPUS_INVALID), _pcpce(NULL),
    _pszUserSid(NULL), _pszQualifiedUserName(NULL),
    _bHasAttemptedAutoUnlock(false), _bAutoUnlockFailed(false), _nEmptyPasswordCount(0) {
    LogToFile("YCDeskCredential created");
    _pProvider->AddRef();
    ZeroMemory(_rgFieldStrings, sizeof(_rgFieldStrings));
    ZeroMemory(_rgFieldStatePairs, sizeof(_rgFieldStatePairs));
    ZeroMemory(_rgCredProvFieldDescriptors, sizeof(_rgCredProvFieldDescriptors));
}

YCDeskCredential::~YCDeskCredential() {
    LogToFile("YCDeskCredential destroyed");
    if (_pcpce) {
        _pcpce->Release();
    }
    if (_pszUserSid)
        CoTaskMemFree(_pszUserSid);
    if (_pszQualifiedUserName)
        CoTaskMemFree(_pszQualifiedUserName);

    for (DWORD i = 0; i < YCDFI_NUM_FIELDS; i++) {
        if (_rgFieldStrings[i])
            CoTaskMemFree(_rgFieldStrings[i]);
    }

    _pProvider->Release();
}

HRESULT YCDeskCredential::Initialize(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, ICredentialProviderUser* pcpUser) {
    LogToFile("YCDeskCredential Initialize, cpus=%d", cpus);
    _cpus = cpus;

    ZeroMemory(_rgFieldStrings, sizeof(_rgFieldStrings));
    ZeroMemory(_rgFieldStatePairs, sizeof(_rgFieldStatePairs));

    for (DWORD i = 0; i < YCDFI_NUM_FIELDS; ++i) {
        _rgCredProvFieldDescriptors[i].dwFieldID = i;
        switch (i) {
        case YCDFI_TILEIMAGE:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_TILE_IMAGE;
            break;
        case YCDFI_LARGETEXT:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_LARGE_TEXT;
            break;
        case YCDFI_SMALLTEXT:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_SMALL_TEXT;
            break;
        case YCDFI_USERNAME:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_EDIT_TEXT;
            break;
        case YCDFI_PASSWORD:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_PASSWORD_TEXT;
            break;
        case YCDFI_SUBMIT_BUTTON:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_SUBMIT_BUTTON;
            break;
        default:
            _rgCredProvFieldDescriptors[i].cpft = CPFT_INVALID;
            break;
        }
    }

    if (pcpUser) {
        HRESULT hr = pcpUser->GetSid(&_pszUserSid);
        if (SUCCEEDED(hr)) {
            LogToFile("Credential Initialize: Got user SID");
        }

        hr = pcpUser->GetStringValue(PKEY_Identity_QualifiedUserName, &_pszQualifiedUserName);
        if (SUCCEEDED(hr)) {
            LogToFile("Credential Initialize: Got qualified username: %ls", _pszQualifiedUserName);
        }
    }

    if (SUCCEEDED(SHStrDupW(L"YCDesk", &_rgFieldStrings[YCDFI_LARGETEXT]))) {
        LogToFile("Credential Initialize: Set large text OK");
    }

    if (SUCCEEDED(SHStrDupW(L"Click to unlock with YCDesk", &_rgFieldStrings[YCDFI_SMALLTEXT]))) {
        LogToFile("Credential Initialize: Set small text OK");
    }

    // Pre-fill username so user only needs to enter password
    autoFillUsername();

    LogToFile("Credential Initialize: Complete");
    return S_OK;
}

void YCDeskCredential::autoFillUsername() {
    LogToFile("autoFillUsername: Starting username detection...");

    // Method 1: Use qualified username from LogonUI
    if (_pszQualifiedUserName && wcslen(_pszQualifiedUserName) > 0) {
        WCHAR domain[MAX_PATH] = {0};
        WCHAR user[MAX_PATH] = {0};
        
        // Split DOMAIN\User format
        WCHAR* backslash = wcschr(_pszQualifiedUserName, L'\\');
        if (backslash) {
            wcsncpy_s(domain, backslash - _pszQualifiedUserName + 1, _pszQualifiedUserName, backslash - _pszQualifiedUserName);
            wcscpy_s(user, backslash + 1);
            
            if (wcslen(user) > 0 && wcscmp(user, L"SYSTEM") != 0) {
                SHStrDupW(user, &_rgFieldStrings[YCDFI_USERNAME]);
                LogToFile("autoFillUsername: Set from qualified name: %ls", user);
                return;
            }
        } else {
            if (wcslen(_pszQualifiedUserName) > 0) {
                SHStrDupW(_pszQualifiedUserName, &_rgFieldStrings[YCDFI_USERNAME]);
                LogToFile("autoFillUsername: Set from qualified name: %ls", _pszQualifiedUserName);
                return;
            }
        }
    }

    // Method 2: WTSQuerySessionInformation
    DWORD sessionId = WTSGetActiveConsoleSessionId();
    if (sessionId != 0xFFFFFFFF) {
        LPWSTR pBuffer = NULL;
        DWORD bytesReturned = 0;
        if (WTSQuerySessionInformationW(WTS_CURRENT_SERVER_HANDLE, sessionId, WTSUserName, &pBuffer, &bytesReturned)) {
            if (pBuffer && wcslen(pBuffer) > 0 && wcscmp(pBuffer, L"SYSTEM") != 0) {
                SHStrDupW(pBuffer, &_rgFieldStrings[YCDFI_USERNAME]);
                LogToFile("autoFillUsername: Set from WTS session %d: %ls", sessionId, pBuffer);
                WTSFreeMemory(pBuffer);
                return;
            }
            if (pBuffer) WTSFreeMemory(pBuffer);
        }
        LogToFile("autoFillUsername: WTS failed or returned SYSTEM");
    }

    // Method 3: Registry ProfileList enumeration
    HKEY hKeyEnum;
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, 
        L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList",
        0, KEY_READ, &hKeyEnum) == ERROR_SUCCESS) {
        
        WCHAR subKey[256];
        DWORD index = 0;
        
        while (RegEnumKeyW(hKeyEnum, index++, subKey, ARRAYSIZE(subKey)) == ERROR_SUCCESS) {
            if (wcslen(subKey) < 12) continue; // Skip short SIDs
            
            HKEY hSubKey;
            if (RegOpenKeyExW(hKeyEnum, subKey, 0, KEY_READ, &hSubKey) == ERROR_SUCCESS) {
                WCHAR profilePath[512] = {0};
                DWORD size = sizeof(profilePath);
                
                if (RegQueryValueExW(hSubKey, L"ProfileImagePath", NULL, NULL,
                    (LPBYTE)profilePath, &size) == ERROR_SUCCESS) {
                    
                    WCHAR* lastSlash = wcsrchr(profilePath, L'\\');
                    if (lastSlash) {
                        WCHAR* username = lastSlash + 1;
                        if (wcslen(username) > 0 
                            && wcscmp(username, L"SYSTEM") != 0
                            && wcscmp(username, L"Public") != 0
                            && wcscmp(username, L"Default") != 0
                            && wcscmp(username, L"defaultuser0") != 0) {
                            
                            SHStrDupW(username, &_rgFieldStrings[YCDFI_USERNAME]);
                            LogToFile("autoFillUsername: Set from registry: %ls", username);
                            RegCloseKey(hSubKey);
                            RegCloseKey(hKeyEnum);
                            return;
                        }
                    }
                }
                RegCloseKey(hSubKey);
            }
        }
        RegCloseKey(hKeyEnum);
    }

    LogToFile("autoFillUsername: Could not determine username");
}

IFACEMETHODIMP_(ULONG) YCDeskCredential::AddRef() {
    return InterlockedIncrement(&_cRef);
}

IFACEMETHODIMP_(ULONG) YCDeskCredential::Release() {
    LONG cRef = InterlockedDecrement(&_cRef);
    if (!cRef)
        delete this;
    return cRef;
}

IFACEMETHODIMP YCDeskCredential::QueryInterface(REFIID riid, void** ppv) {
    static const QITAB qitab[] = {
        QITABENT(YCDeskCredential, ICredentialProviderCredential),
        QITABENT(YCDeskCredential, ICredentialProviderCredential2),
        QITABENT(YCDeskCredential, ICredentialProviderCredentialWithFieldOptions),
        { 0 },
    };

    HRESULT hr = QISearch(this, qitab, riid, ppv);

    LPOLESTR pszIID = NULL;
    if (SUCCEEDED(StringFromIID(riid, &pszIID))) {
        LogToFile("Credential QueryInterface: %ls, hr=0x%08X", pszIID, hr);
        CoTaskMemFree(pszIID);
    }

    return hr;
}

IFACEMETHODIMP YCDeskCredential::Advise(ICredentialProviderCredentialEvents* pcpce) {
    LogToFile("Credential Advise");
    _pcpce = pcpce;
    if (_pcpce)
        _pcpce->AddRef();
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::UnAdvise() {
    LogToFile("Credential UnAdvise");
    if (_pcpce) {
        _pcpce->Release();
        _pcpce = NULL;
    }
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::SetSelected(BOOL* pbAutoLogon) {
    LogToFile("Credential SetSelected");
    
    if (pbAutoLogon) {
        // Do NOT set auto-logon here!
        // Setting pbAutoLogon = TRUE in SetSelected without credentials being submitted
        // will cause login failure and lock screen loop.
        // Auto-logon should ONLY be set in GetSerialization when credentials are actually packed.
        *pbAutoLogon = FALSE;
    }
    
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::SetDeselected() {
    LogToFile("Credential SetDeselected");
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetFieldState(DWORD dwFieldID, CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs, CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis) {
    LogToFile("Credential GetFieldState %lu", dwFieldID);

    if (!pcpfs || !pcpfis) {
        return E_INVALIDARG;
    }

    if (dwFieldID >= YCDFI_NUM_FIELDS) {
        return E_INVALIDARG;
    }

    *pcpfs = CPFS_DISPLAY_IN_BOTH;
    *pcpfis = CPFIS_NONE;

    LogToFile("Credential GetFieldState %lu: state=%d", dwFieldID, *pcpfs);
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetStringValue(DWORD dwFieldID, PWSTR* ppwsz) {
    *ppwsz = NULL;
    LogToFile("Credential GetStringValue %lu", dwFieldID);

    if (dwFieldID >= YCDFI_NUM_FIELDS) {
        return E_INVALIDARG;
    }

    if (_rgFieldStrings[dwFieldID]) {
        HRESULT hr = SHStrDupW(_rgFieldStrings[dwFieldID], ppwsz);
        if (SUCCEEDED(hr)) {
            LogToFile("Credential GetStringValue %lu: OK, returning: %ls", dwFieldID, *ppwsz);
        }
        return hr;
    }

    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp) {
    LogToFile("Credential GetBitmapValue %lu", dwFieldID);

    if (!phbmp) {
        return E_INVALIDARG;
    }

    *phbmp = NULL;
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetCheckboxValue(DWORD, BOOL*, PWSTR*) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetSubmitButtonValue(DWORD dwFieldID, DWORD* pdwAdjacentTo) {
    LogToFile("Credential GetSubmitButtonValue %lu", dwFieldID);

    if (!pdwAdjacentTo) {
        return E_INVALIDARG;
    }

    if (dwFieldID == YCDFI_SUBMIT_BUTTON) {
        *pdwAdjacentTo = YCDFI_PASSWORD;
        return S_OK;
    }

    return E_INVALIDARG;
}

IFACEMETHODIMP YCDeskCredential::GetComboBoxValueCount(DWORD, DWORD*, DWORD*) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetComboBoxValueAt(DWORD, DWORD, PWSTR*) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::SetStringValue(DWORD dwFieldID, PCWSTR pwz) {
    LogToFile("Credential SetStringValue %lu", dwFieldID);

    if (dwFieldID >= YCDFI_NUM_FIELDS) {
        return E_INVALIDARG;
    }

    if (_rgFieldStrings[dwFieldID]) {
        CoTaskMemFree(_rgFieldStrings[dwFieldID]);
        _rgFieldStrings[dwFieldID] = NULL;
    }

    if (pwz && wcslen(pwz) > 0) {
        return SHStrDupW(pwz, &_rgFieldStrings[dwFieldID]);
    }

    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::SetCheckboxValue(DWORD, BOOL) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::SetComboBoxSelectedValue(DWORD, DWORD) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::CommandLinkClicked(DWORD) {
    return E_NOTIMPL;
}

// Helper: Extract domain from a "DOMAIN\username" or "username@domain" string
static HRESULT SplitDomainUsername(
    _In_ PCWSTR pszQualifiedUserName,
    _Outptr_result_z_ PWSTR* ppszDomain,
    _Outptr_result_z_ PWSTR* ppszUsername) {

    if (!pszQualifiedUserName || !ppszDomain || !ppszUsername) {
        return E_INVALIDARG;
    }

    *ppszDomain = NULL;
    *ppszUsername = NULL;

    PCWSTR pszBackslash = wcschr(pszQualifiedUserName, L'\\');
    if (pszBackslash) {
        size_t domainLen = (size_t)(pszBackslash - pszQualifiedUserName);
        PWSTR domainOut = (PWSTR)CoTaskMemAlloc((domainLen + 1) * sizeof(WCHAR));
        PWSTR userOut = (PWSTR)CoTaskMemAlloc((wcslen(pszBackslash + 1) + 1) * sizeof(WCHAR));
        if (domainOut && userOut) {
            CopyMemory(domainOut, pszQualifiedUserName, domainLen * sizeof(WCHAR));
            domainOut[domainLen] = L'\0';
            wcscpy_s(userOut, wcslen(pszBackslash + 1) + 1, pszBackslash + 1);
            *ppszDomain = domainOut;
            *ppszUsername = userOut;
            return S_OK;
        }
        if (domainOut) CoTaskMemFree(domainOut);
        if (userOut) CoTaskMemFree(userOut);
        return E_OUTOFMEMORY;
    } else {
        PWSTR userOut = (PWSTR)CoTaskMemAlloc((wcslen(pszQualifiedUserName) + 1) * sizeof(WCHAR));
        if (userOut) {
            wcscpy_s(userOut, wcslen(pszQualifiedUserName) + 1, pszQualifiedUserName);
            WCHAR computerName[MAX_COMPUTERNAME_LENGTH + 1];
            DWORD size = ARRAYSIZE(computerName);
            if (GetComputerNameW(computerName, &size)) {
                PWSTR domainOut = (PWSTR)CoTaskMemAlloc((wcslen(computerName) + 1) * sizeof(WCHAR));
                if (domainOut) {
                    wcscpy_s(domainOut, wcslen(computerName) + 1, computerName);
                    *ppszDomain = domainOut;
                    *ppszUsername = userOut;
                    return S_OK;
                }
            }
            CoTaskMemFree(userOut);
        }
    }

    return E_FAIL;
}

// Helper: Initialize KERB_INTERACTIVE_UNLOCK_LOGON structure
static HRESULT KerbInteractiveUnlockLogonInit(
    _In_ PWSTR pszDomain,
    _In_ PWSTR pszUsername,
    _In_ PWSTR pszPassword,
    _Out_ KERB_INTERACTIVE_UNLOCK_LOGON* pkiul) {
    
    if (!pszDomain || !pszUsername || !pszPassword || !pkiul) {
        return E_INVALIDARG;
    }

    ZeroMemory(pkiul, sizeof(*pkiul));
    pkiul->Logon.MessageType = KerbInteractiveLogon;

    HRESULT hr = SHStrDupW(pszDomain, &pkiul->Logon.LogonDomainName.Buffer);
    if (FAILED(hr)) {
        return hr;
    }
    pkiul->Logon.LogonDomainName.Length = (USHORT)(wcslen(pszDomain) * sizeof(WCHAR));
    pkiul->Logon.LogonDomainName.MaximumLength = pkiul->Logon.LogonDomainName.Length + sizeof(WCHAR);

    hr = SHStrDupW(pszUsername, &pkiul->Logon.UserName.Buffer);
    if (FAILED(hr)) {
        CoTaskMemFree(pkiul->Logon.LogonDomainName.Buffer);
        return hr;
    }
    pkiul->Logon.UserName.Length = (USHORT)(wcslen(pszUsername) * sizeof(WCHAR));
    pkiul->Logon.UserName.MaximumLength = pkiul->Logon.UserName.Length + sizeof(WCHAR);

    hr = SHStrDupW(pszPassword, &pkiul->Logon.Password.Buffer);
    if (FAILED(hr)) {
        CoTaskMemFree(pkiul->Logon.LogonDomainName.Buffer);
        CoTaskMemFree(pkiul->Logon.UserName.Buffer);
        return hr;
    }
    pkiul->Logon.Password.Length = (USHORT)(wcslen(pszPassword) * sizeof(WCHAR));
    pkiul->Logon.Password.MaximumLength = pkiul->Logon.Password.Length + sizeof(WCHAR);

    return S_OK;
}

// Helper: Pack KERB_INTERACTIVE_UNLOCK_LOGON into a flat buffer
static HRESULT KerbInteractiveUnlockLogonPack(
    _Inout_ KERB_INTERACTIVE_UNLOCK_LOGON* pkiul,
    _Outptr_result_bytebuffer_(*pcb) BYTE** ppb,
    _Out_ DWORD* pcb) {

    if (!pkiul || !ppb || !pcb) {
        return E_INVALIDARG;
    }

    *ppb = NULL;
    *pcb = 0;

    DWORD cbDomain = pkiul->Logon.LogonDomainName.MaximumLength;
    DWORD cbUser = pkiul->Logon.UserName.MaximumLength;
    DWORD cbPass = pkiul->Logon.Password.MaximumLength;
    DWORD cbTotal = sizeof(KERB_INTERACTIVE_UNLOCK_LOGON) + cbDomain + cbUser + cbPass;

    BYTE* pb = (BYTE*)CoTaskMemAlloc(cbTotal);
    if (!pb) {
        return E_OUTOFMEMORY;
    }

    ZeroMemory(pb, cbTotal);

    KERB_INTERACTIVE_UNLOCK_LOGON* pkiulOut = (KERB_INTERACTIVE_UNLOCK_LOGON*)pb;
    CopyMemory(pkiulOut, pkiul, sizeof(KERB_INTERACTIVE_UNLOCK_LOGON));

    DWORD offset = sizeof(KERB_INTERACTIVE_UNLOCK_LOGON);

    if (cbDomain > 0) {
        CopyMemory(pb + offset, pkiul->Logon.LogonDomainName.Buffer, cbDomain);
        pkiulOut->Logon.LogonDomainName.Buffer = (PWSTR)(ULONG_PTR)offset;
    }
    offset += cbDomain;

    if (cbUser > 0) {
        CopyMemory(pb + offset, pkiul->Logon.UserName.Buffer, cbUser);
        pkiulOut->Logon.UserName.Buffer = (PWSTR)(ULONG_PTR)offset;
    }
    offset += cbUser;

    if (cbPass > 0) {
        CopyMemory(pb + offset, pkiul->Logon.Password.Buffer, cbPass);
        pkiulOut->Logon.Password.Buffer = (PWSTR)(ULONG_PTR)offset;
    }

    *ppb = pb;
    *pcb = cbTotal;
    return S_OK;
}

// Helper: Retrieve Negotiate authentication package
static HRESULT RetrieveNegotiateAuthPackage(_Out_ ULONG* pulAuthPackage) {
    if (!pulAuthPackage) {
        return E_INVALIDARG;
    }
    *pulAuthPackage = 0;

    HANDLE hLsa = NULL;
    NTSTATUS status = LsaConnectUntrusted(&hLsa);
    if (status != 0) {
        return HRESULT_FROM_NT(status);
    }

    LSA_STRING lsaszNegotiatePackage;
    const char* szNegotiate = "Negotiate";
    lsaszNegotiatePackage.Buffer = (PSTR)szNegotiate;
    lsaszNegotiatePackage.Length = (USHORT)strlen(szNegotiate);
    lsaszNegotiatePackage.MaximumLength = lsaszNegotiatePackage.Length + 1;

    ULONG authPackage = 0;
    status = LsaLookupAuthenticationPackage(hLsa, &lsaszNegotiatePackage, &authPackage);
    LsaDeregisterLogonProcess(hLsa);

    if (status != 0) {
        return HRESULT_FROM_NT(status);
    }

    *pulAuthPackage = authPackage;
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetSerialization(
    CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr,
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
    PWSTR* ppwszOptionalStatusText,
    CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) {

    LogToFile("Credential GetSerialization called");

    if (!pcpgsr || !pcpcs) {
        LogToFile("GetSerialization: NULL parameter detected");
        return E_INVALIDARG;
    }

    *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
    ZeroMemory(pcpcs, sizeof(*pcpcs));

    if (ppwszOptionalStatusText) {
        *ppwszOptionalStatusText = NULL;
    }

    if (pcpsiOptionalStatusIcon) {
        *pcpsiOptionalStatusIcon = CPSI_NONE;
    }

    // CRITICAL FIX: Check if auto-unlock should be permanently disabled
    // This prevents the infinite lock screen loop!
    if (_bAutoUnlockFailed && _nEmptyPasswordCount >= MAX_EMPTY_PASSWORD_ATTEMPTS) {
        LogToFile("GetSerialization: Auto-unlock PERMANENTLY DISABLED (failed attempts: %d)", 
                  _nEmptyPasswordCount);
        LogToFile("GetSerialization: User must restart machine or reinstall CP to re-enable");
        
        // Show warning on login screen
        if (ppwszOptionalStatusText) {
            SHStrDupW(L"Auto-unlock permanently disabled. Please enter credentials manually.", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon) {
            *pcpsiOptionalStatusIcon = CPSI_WARNING;
        }
        
        // Return without submitting - let user enter manually
        return S_OK;
    }
    
    // Soft disable: allow new attempts if controller sends fresh credentials
    if (_bAutoUnlockFailed) {
        LogToFile("GetSerialization: Auto-unlock temporarily disabled, waiting for new credentials");
        // Allow continuation to try IPC again
    }

    // First: Try IPC to get credentials from controller for auto-unlock
    PWSTR pszIpcUsername = NULL;
    PWSTR pszIpcPassword = NULL;
    bool bGotIpcCredentials = false;

    LogToFile("GetSerialization: Try IPC connection (attempt %d)", _nEmptyPasswordCount + 1);

    {
        UnlockIpcClient ipcClient;
        bool bConnected = ipcClient.Connect();
        if (bConnected) {
            bool bUnlockRequested = ipcClient.RequestUnlock(&pszIpcUsername, &pszIpcPassword);
            ipcClient.Disconnect();

            if (bUnlockRequested && pszIpcUsername && pszIpcPassword &&
                wcslen(pszIpcUsername) > 0 && wcslen(pszIpcPassword) > 0) {
                LogToFile("GetSerialization: Success! IPC gave username=%ls", pszIpcUsername);
                bGotIpcCredentials = true;
                _bHasAttemptedAutoUnlock = true;
                _nEmptyPasswordCount = 0;  // Reset counter
                _bAutoUnlockFailed = false;  // Clear failure flag for new attempt
                
                // Clear the unlock flag file so we don't auto-login on next lock screen
                DeleteFileW(L"C:\\ProgramData\\YCDesk\\unlock_ready.flag");
                LogToFile("GetSerialization: Cleared unlock flag file");
            } else {
                LogToFile("GetSerialization: IPC gave no credentials or empty password");
                
                // Track empty password attempts
                _nEmptyPasswordCount++;
                _bAutoUnlockFailed = (_nEmptyPasswordCount >= MAX_EMPTY_PASSWORD_ATTEMPTS);
                
                if (pszIpcUsername) CoTaskMemFree(pszIpcUsername);
                if (pszIpcPassword) CoTaskMemFree(pszIpcPassword);
                pszIpcUsername = NULL;
                pszIpcPassword = NULL;
            }
        } else {
            LogToFile("GetSerialization: IPC connection failed - no controller available");
        }
    }

    // Fallback: If IPC didn't give us credentials, try reading from file
    if (!bGotIpcCredentials) {
        LogToFile("GetSerialization: Trying fallback - read credentials from file");
        HANDLE hCredFile = CreateFileW(
            L"C:\\ProgramData\\YCDesk\\unlock_creds.dat",
            GENERIC_READ,
            FILE_SHARE_READ,
            NULL,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            NULL);

        if (hCredFile != INVALID_HANDLE_VALUE) {
            BYTE fileBuf[1024] = {0};
            DWORD bytesRead = 0;
            if (ReadFile(hCredFile, fileBuf, sizeof(fileBuf) - 2, &bytesRead, NULL) && bytesRead > 0) {
                // File format: username\0password in UTF-16LE
                WCHAR* wbuf = (WCHAR*)fileBuf;
                DWORD wlen = bytesRead / sizeof(WCHAR);
                
                // Find first null (separator between username and password)
                DWORD nullPos = 0;
                while (nullPos < wlen && wbuf[nullPos] != L'\0') nullPos++;
                
                if (nullPos > 0 && nullPos < wlen - 1) {
                    DWORD userLen = nullPos;
                    pszIpcUsername = (PWSTR)CoTaskMemAlloc((userLen + 1) * sizeof(WCHAR));
                    if (pszIpcUsername) {
                        wcsncpy_s(pszIpcUsername, userLen + 1, wbuf, userLen);
                        pszIpcUsername[userLen] = L'\0';
                    }
                    
                    DWORD passStart = nullPos + 1;
                    DWORD passLen = wlen - passStart;
                    if (wbuf[passLen + passStart - 1] == L'\0') passLen--; // strip trailing null
                    
                    pszIpcPassword = (PWSTR)CoTaskMemAlloc((passLen + 1) * sizeof(WCHAR));
                    if (pszIpcPassword) {
                        wcsncpy_s(pszIpcPassword, passLen + 1, wbuf + passStart, passLen);
                        pszIpcPassword[passLen] = L'\0';
                    }
                    
                    if (pszIpcUsername && pszIpcPassword && 
                        wcslen(pszIpcUsername) > 0 && wcslen(pszIpcPassword) > 0) {
                        LogToFile("GetSerialization: File fallback SUCCESS! user=%ls", pszIpcUsername);
                        bGotIpcCredentials = true;
                        _bHasAttemptedAutoUnlock = true;
                        _nEmptyPasswordCount = 0;
                        _bAutoUnlockFailed = false;
                        DeleteFileW(L"C:\\ProgramData\\YCDesk\\unlock_ready.flag");
                        LogToFile("GetSerialization: Cleared unlock flag file");
                    } else {
                        LogToFile("GetSerialization: File fallback - empty credentials");
                        if (pszIpcUsername) { CoTaskMemFree(pszIpcUsername); pszIpcUsername = NULL; }
                        if (pszIpcPassword) { CoTaskMemFree(pszIpcPassword); pszIpcPassword = NULL; }
                    }
                } else {
                    LogToFile("GetSerialization: File fallback - invalid format");
                }
            } else {
                LogToFile("GetSerialization: File fallback - read failed: %lu", GetLastError());
            }
            CloseHandle(hCredFile);
            
            // Delete the credential file immediately after reading (security)
            DeleteFileW(L"C:\\ProgramData\\YCDesk\\unlock_creds.dat");
        } else {
            LogToFile("GetSerialization: No credential file available (%lu)", GetLastError());
        }
    }

    // Second: Use either IPC credentials or manual input
    PWSTR pszUsername = NULL;
    PWSTR pszPassword = NULL;

    if (bGotIpcCredentials) {
        pszUsername = pszIpcUsername;
        pszPassword = pszIpcPassword;
        LogToFile("GetSerialization: Using IPC credentials for auto-unlock");
    } else {
        // CRITICAL FIX: When no credentials are available, we MUST return S_OK
        // WITHOUT setting *pcpgsr to anything. This prevents the login loop!
        
        _bAutoUnlockFailed = true;
        
        LogToFile("GetSerialization: No credentials available, switching to manual mode");
        LogToFile("GetSerialization: User must enter credentials manually now");
        
        // Show helpful message
        if (ppwszOptionalStatusText) {
            SHStrDupW(L"No remote unlock credentials available. Please enter your credentials.", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon) {
            *pcpsiOptionalStatusIcon = CPSI_NONE;
        }
        
        return S_OK;
    }

    // Validate credentials one more time before packaging
    if (!pszPassword || wcslen(pszPassword) == 0) {
        LogToFile("GetSerialization: EMPTY PASSWORD DETECTED! Aborting submission to prevent lock loop");
        _nEmptyPasswordCount++;
        _bAutoUnlockFailed = true;
        
        if (pszUsername) CoTaskMemFree(pszUsername);
        if (pszPassword) CoTaskMemFree(pszPassword);
        
        return S_OK;
    }

    // Now we have credentials! Package them up
    LogToFile("GetSerialization: Now packaging credentials for user %ls", pszUsername);

    // First determine domain and username
    PWSTR pszDomain = NULL;
    PWSTR pszUser = NULL;
    if (_pszQualifiedUserName && wcslen(_pszQualifiedUserName) > 0) {
        if (SUCCEEDED(SplitDomainUsername(_pszQualifiedUserName, &pszDomain, &pszUser))) {
            LogToFile("GetSerialization: Using domain=%ls, user=%ls", pszDomain, pszUser);
        }
    }

    // If we don't have domain from qualified name, use local computer name
    if (!pszDomain) {
        WCHAR computerName[MAX_COMPUTERNAME_LENGTH + 1];
        DWORD size = ARRAYSIZE(computerName);
        if (GetComputerNameW(computerName, &size)) {
            pszDomain = (PWSTR)CoTaskMemAlloc((wcslen(computerName) + 1) * sizeof(WCHAR));
            if (pszDomain) {
                wcscpy_s(pszDomain, wcslen(computerName) + 1, computerName);
            }
        }
        if (!pszDomain) {
            pszDomain = (PWSTR)CoTaskMemAlloc(2 * sizeof(WCHAR));
            if (pszDomain) {
                pszDomain[0] = L'\0';
            }
        }
    }

    if (!pszUser) {
        pszUser = (PWSTR)CoTaskMemAlloc((wcslen(pszUsername) + 1) * sizeof(WCHAR));
        if (pszUser) {
            wcscpy_s(pszUser, wcslen(pszUsername) + 1, pszUsername);
        }
    }

    // Get authentication package
    ULONG authPackage = 0;
    HRESULT hrAuthPackage = RetrieveNegotiateAuthPackage(&authPackage);
    if (FAILED(hrAuthPackage)) {
        LogToFile("GetSerialization: Failed to get auth package, hr=0x%08X", hrAuthPackage);
        // Cannot use a default - must fail here
        _bAutoUnlockFailed = true;
        _nEmptyPasswordCount = MAX_EMPTY_PASSWORD_ATTEMPTS;
        return S_OK;
    }

    // Initialize KERB_INTERACTIVE_UNLOCK_LOGON
    KERB_INTERACTIVE_UNLOCK_LOGON kiul;
    HRESULT hrKerb = KerbInteractiveUnlockLogonInit(
        pszDomain ? pszDomain : L".",
        pszUser ? pszUser : pszUsername,
        pszPassword,
        &kiul);

    if (SUCCEEDED(hrKerb)) {
        // Pack it
        BYTE* pbCredBlob = NULL;
        DWORD cbCredBlob = 0;
        HRESULT hrPack = KerbInteractiveUnlockLogonPack(&kiul, &pbCredBlob, &cbCredBlob);

        if (SUCCEEDED(hrPack)) {
            pcpcs->cbSerialization = cbCredBlob;
            pcpcs->rgbSerialization = pbCredBlob;
            pcpcs->ulAuthenticationPackage = authPackage;
            *pcpgsr = CPGSR_RETURN_CREDENTIAL_FINISHED;
            LogToFile("GetSerialization: SUCCESS! Credential packaged for serialization");
            
            // CRITICAL: DO NOT reset failure counters here!
            // Only reset them in ReportResult if login actually succeeds.
            // This prevents the infinite lock screen loop.
            LogToFile("GetSerialization: Will wait for ReportResult to confirm success");
        } else {
            LogToFile("GetSerialization: Failed to pack kerb, hr=0x%08X", hrPack);
            _bAutoUnlockFailed = true;
        }

        // Cleanup the KERB buffers
        if (kiul.Logon.LogonDomainName.Buffer) CoTaskMemFree(kiul.Logon.LogonDomainName.Buffer);
        if (kiul.Logon.UserName.Buffer) CoTaskMemFree(kiul.Logon.UserName.Buffer);
        if (kiul.Logon.Password.Buffer) CoTaskMemFree(kiul.Logon.Password.Buffer);
    } else {
        LogToFile("GetSerialization: Failed to init kerb, hr=0x%08X", hrKerb);
        _bAutoUnlockFailed = true;
    }

    if (pszDomain) CoTaskMemFree(pszDomain);
    if (pszUser) CoTaskMemFree(pszUser);
    if (pszUsername) CoTaskMemFree(pszUsername);
    if (pszPassword) CoTaskMemFree(pszPassword);

    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::ReportResult(NTSTATUS ntsStatus, NTSTATUS ntsSubstatus, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) {
    LogToFile("Credential ReportResult, status=0x%08X, substatus=0x%08X", ntsStatus, ntsSubstatus);
    
    if (ppwszOptionalStatusText) {
        *ppwszOptionalStatusText = NULL;
    }
    if (pcpsiOptionalStatusIcon) {
        *pcpsiOptionalStatusIcon = CPSI_NONE;
    }
    
    // CRITICAL FIX: When login fails, we MUST disable auto-unlock to prevent lock screen loop!
    // NTSTATUS codes:
    //   0xC000006A = STATUS_WRONG_PASSWORD
    //   0xC000006D = STATUS_LOGON_FAILURE
    //   0xC000006E = STATUS_ACCOUNT_RESTRICTION
    //   0xC0000193 = STATUS_ACCOUNT_EXPIRED
    //   0xC0000071 = STATUS_PASSWORD_EXPIRED
    
    if (ntsStatus != 0) {  // Non-zero means failure
        LogToFile("ReportResult: LOGIN FAILED! Disabling auto-unlock permanently");
        _bAutoUnlockFailed = true;
        _nEmptyPasswordCount = MAX_EMPTY_PASSWORD_ATTEMPTS;  // Force disable
        
        // Show error message on login screen
        if (ppwszOptionalStatusText) {
            SHStrDupW(L"Remote unlock failed. Please enter credentials manually.", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon) {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }
    } else {
        LogToFile("ReportResult: Login succeeded");
    }
    
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetUserSid(_Outptr_result_maybenull_ PWSTR* ppszSid) {
    LogToFile("Credential GetUserSid");
    *ppszSid = NULL;
    if (_pszUserSid) {
        return SHStrDupW(_pszUserSid, ppszSid);
    }
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetFieldOptions(DWORD dwFieldID, _Out_ CREDENTIAL_PROVIDER_CREDENTIAL_FIELD_OPTIONS* pcpcfo) {
    LogToFile("Credential GetFieldOptions %lu", dwFieldID);
    if (!pcpcfo) {
        return E_INVALIDARG;
    }
    *pcpcfo = CPCFO_NONE;
    return S_OK;
}
