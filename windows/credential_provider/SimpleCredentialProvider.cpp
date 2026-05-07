// 最简单的Credential Provider实现 - 用于测试
#include <windows.h>
#include <credentialprovider.h>
#include <shlwapi.h>
#include <objbase.h>
#include <stdio.h>

#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shlwapi.lib")

// {849A629B-903E-422F-AE57-308E1C10C34C}
static const GUID CLSID_SimpleProvider = { 0x849a629b, 0x903e, 0x422f, { 0xae, 0x57, 0x30, 0x8e, 0x1c, 0x10, 0xc3, 0x4c } };

class SimpleCredentialProvider : public ICredentialProvider
{
public:
    SimpleCredentialProvider() : _cRef(1)
    {
    }
    
    // IUnknown
    IFACEMETHODIMP_(ULONG) AddRef()
    {
        return InterlockedIncrement(&_cRef);
    }
    
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
            QITABENT(SimpleCredentialProvider, ICredentialProvider),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }

    // ICredentialProvider
    IFACEMETHODIMP SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, DWORD dwFlags)
    {
        _cpus = cpus;
        return S_OK;
    }

    IFACEMETHODIMP SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP Advise(ICredentialProviderEvents* pcpe, UINT_PTR upAdviseContext)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP UnAdvise()
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetFieldDescriptorCount(DWORD* pdwCount)
    {
        *pdwCount = 1;
        return S_OK;
    }

    IFACEMETHODIMP GetFieldDescriptorAt(DWORD dwIndex, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd)
    {
        HRESULT hr = E_INVALIDARG;
        
        if (dwIndex == 0 && ppcpfd)
        {
            *ppcpfd = (CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR*)CoTaskMemAlloc(sizeof(CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR));
            if (*ppcpfd)
            {
                ZeroMemory(*ppcpfd, sizeof(CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR));
                (*ppcpfd)->dwFieldID = 0;
                (*ppcpfd)->cpft = CPFT_LARGE_TEXT;
                (*ppcpfd)->guidFieldType = CPFG_CREDENTIAL_PROVIDER_LOGO;
                hr = SHStrDupW(L"RemoteDesk", &(*ppcpfd)->pszLabel);
                if (FAILED(hr))
                {
                    CoTaskMemFree(*ppcpfd);
                    *ppcpfd = nullptr;
                }
            }
            else
            {
                hr = E_OUTOFMEMORY;
            }
        }
        return hr;
    }

    IFACEMETHODIMP GetCredentialCount(DWORD* pdwCount, DWORD* pdwDefault, BOOL* pbAutoLogonWithDefault)
    {
        *pdwCount = 1;
        *pdwDefault = 0;
        *pbAutoLogonWithDefault = FALSE;
        return S_OK;
    }

    IFACEMETHODIMP GetCredentialAt(DWORD dwIndex, ICredentialProviderCredential** ppcpc)
    {
        HRESULT hr = E_INVALIDARG;
        if (dwIndex == 0 && ppcpc)
        {
            SimpleCredential* pCred = new SimpleCredential(this);
            if (pCred)
            {
                hr = pCred->QueryInterface(IID_PPV_ARGS(ppcpc));
                pCred->Release();
            }
            else
            {
                hr = E_OUTOFMEMORY;
            }
        }
        return hr;
    }

private:
    ~SimpleCredentialProvider() { }

    friend class SimpleCredential;
    LONG _cRef;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO _cpus;
};

class SimpleCredential : public ICredentialProviderCredential
{
public:
    SimpleCredential(SimpleCredentialProvider* pProvider) : _cRef(1), _pProvider(pProvider)
    {
        _pProvider->AddRef();
    }

    // IUnknown
    IFACEMETHODIMP_(ULONG) AddRef()
    {
        return InterlockedIncrement(&_cRef);
    }

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
            QITABENT(SimpleCredential, ICredentialProviderCredential),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }

    // ICredentialProviderCredential
    IFACEMETHODIMP Advise(ICredentialProviderCredentialEvents* pcpce)
    {
        return S_OK;
    }

    IFACEMETHODIMP UnAdvise()
    {
        return S_OK;
    }

    IFACEMETHODIMP SetSelected(BOOL* pbAutoLogon)
    {
        *pbAutoLogon = FALSE;
        return S_OK;
    }

    IFACEMETHODIMP SetDeselected()
    {
        return S_OK;
    }

    IFACEMETHODIMP GetFieldState(DWORD dwFieldID, CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs, CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis)
    {
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        return S_OK;
    }

    IFACEMETHODIMP GetStringValue(DWORD dwFieldID, PWSTR* ppwsz)
    {
        return SHStrDupW(L"Simple Test", ppwsz);
    }

    IFACEMETHODIMP GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp)
    {
        *phbmp = nullptr;
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetCheckboxValue(DWORD dwFieldID, BOOL* pbChecked, PWSTR* ppwszLabel)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetSubmitButtonValue(DWORD dwFieldID, DWORD* pdwAdjacentTo)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetComboBoxValueCount(DWORD dwFieldID, DWORD* pdwItems, DWORD* pdwSelectedItem)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetComboBoxValueAt(DWORD dwFieldID, DWORD dwItem, PWSTR* ppwszItem)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP SetStringValue(DWORD dwFieldID, PCWSTR pwz)
    {
        return S_OK;
    }

    IFACEMETHODIMP SetCheckboxValue(DWORD dwFieldID, BOOL bChecked)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP SetComboBoxSelectedValue(DWORD dwFieldID, DWORD dwSelectedItem)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP CommandLinkClicked(DWORD dwFieldID)
    {
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetSerialization(CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr, CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon)
    {
        *ppwszOptionalStatusText = nullptr;
        *pcpsiOptionalStatusIcon = CPSI_NONE;
        *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
        return S_OK;
    }

    IFACEMETHODIMP ReportResult(NTSTATUS ntsStatus, NTSTATUS ntsSubstatus, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon)
    {
        *ppwszOptionalStatusText = nullptr;
        *pcpsiOptionalStatusIcon = CPSI_NONE;
        return S_OK;
    }

private:
    ~SimpleCredential()
    {
        if (_pProvider)
            _pProvider->Release();
    }

    LONG _cRef;
    SimpleCredentialProvider* _pProvider;
};

class SimpleProviderFactory : public IClassFactory
{
public:
    SimpleProviderFactory() : _cRef(1) { }
    
    // IUnknown
    IFACEMETHODIMP_(ULONG) AddRef()
    {
        return InterlockedIncrement(&_cRef);
    }
    
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
            QITABENT(SimpleProviderFactory, IClassFactory),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }
    
    // IClassFactory
    IFACEMETHODIMP CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppv)
    {
        HRESULT hr = CLASS_E_NOAGGREGATION;
        if (!pUnkOuter)
        {
            SimpleCredentialProvider* pProvider = new SimpleCredentialProvider();
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
            InterlockedIncrement(&g_cRefDll);
        else
            InterlockedDecrement(&g_cRefDll);
        return S_OK;
    }

private:
    ~SimpleProviderFactory() { }
    LONG _cRef;
};

static LONG g_cRefDll = 0;

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv)
{
    HRESULT hr = E_OUTOFMEMORY;
    *ppv = nullptr;

    if (IsEqualGUID(rclsid, CLSID_SimpleProvider))
    {
        SimpleProviderFactory* pFactory = new SimpleProviderFactory();
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
    return hr;
}

STDAPI DllCanUnloadNow()
{
    return (g_cRefDll == 0) ? S_OK : S_FALSE;
}

STDAPI DllRegisterServer()
{
    wchar_t szModule[MAX_PATH];
    GetModuleFileNameW((HMODULE)&__ImageBase, szModule, ARRAYSIZE(szModule));

    wchar_t szCLSID[64];
    StringFromGUID2(CLSID_SimpleProvider, szCLSID, ARRAYSIZE(szCLSID));

    wchar_t szKey[256];
    StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"CLSID\\%s", szCLSID);

    HKEY hKey;
    if (RegCreateKeyExW(HKEY_LOCAL_MACHINE, szKey, 0, nullptr, 0, KEY_WRITE, nullptr, &hKey, nullptr) == ERROR_SUCCESS)
    {
        RegSetValueExW(hKey, nullptr, 0, REG_SZ, (BYTE*)L"Simple Test Provider", (DWORD)(wcslen(L"Simple Test Provider") + 1) * sizeof(wchar_t));
        
        HKEY hSubkey;
        if (RegCreateKeyExW(hKey, L"InprocServer32", 0, nullptr, 0, KEY_WRITE, nullptr, &hSubkey, nullptr) == ERROR_SUCCESS)
        {
            RegSetValueExW(hSubkey, nullptr, 0, REG_SZ, (BYTE*)szModule, (DWORD)(wcslen(szModule) + 1) * sizeof(wchar_t));
            RegSetValueExW(hSubkey, L"ThreadingModel", 0, REG_SZ, (BYTE*)L"Apartment", (DWORD)(wcslen(L"Apartment") + 1) * sizeof(wchar_t));
            RegCloseKey(hSubkey);
        }
        RegCloseKey(hKey);

        StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\%s", szCLSID);
        if (RegCreateKeyExW(HKEY_LOCAL_MACHINE, szKey, 0, nullptr, 0, KEY_WRITE, nullptr, &hKey, nullptr) == ERROR_SUCCESS)
        {
            RegSetValueExW(hKey, nullptr, 0, REG_SZ, (BYTE*)L"Simple Test Provider", (DWORD)(wcslen(L"Simple Test Provider") + 1) * sizeof(wchar_t));
            RegCloseKey(hKey);
        }
    }
    return S_OK;
}

STDAPI DllUnregisterServer()
{
    wchar_t szCLSID[64];
    StringFromGUID2(CLSID_SimpleProvider, szCLSID, ARRAYSIZE(szCLSID));
    
    wchar_t szKey[256];
    StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\%s", szCLSID);
    RegDeleteTreeW(HKEY_LOCAL_MACHINE, szKey);
    
    StringCchPrintfW(szKey, ARRAYSIZE(szKey), L"CLSID\\%s", szCLSID);
    RegDeleteTreeW(HKEY_LOCAL_MACHINE, szKey);
    
    return S_OK;
}
