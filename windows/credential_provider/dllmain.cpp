#include <windows.h>
#include <objbase.h>
#include <shlwapi.h>
#include <shlobj.h>
#include "YCDeskCredentialProvider.h"

// These are defined in YCDeskCredentialProvider.cpp
extern LONG g_cRefDll;
extern HMODULE g_hinst;

// Registry helper functions
static HRESULT SetKeyValue(HKEY hKey, PCWSTR pszValueName, PCWSTR pszValue) {
    DWORD cbData = (DWORD)(wcslen(pszValue) + 1) * sizeof(WCHAR);
    return RegSetValueExW(hKey, pszValueName, 0, REG_SZ, (LPBYTE)pszValue, cbData) == ERROR_SUCCESS ? S_OK : E_FAIL;
}

static HRESULT SetKeyValue(HKEY hKey, PCWSTR pszValueName, DWORD dwValue) {
    return RegSetValueExW(hKey, pszValueName, 0, REG_DWORD, (LPBYTE)&dwValue, sizeof(dwValue)) == ERROR_SUCCESS ? S_OK : E_FAIL;
}

// Class Factory
class CProviderFactory : public IClassFactory {
public:
    CProviderFactory() : m_cRef(1) {
        InterlockedIncrement(&g_cRefDll);
    }

    virtual ~CProviderFactory() {
        InterlockedDecrement(&g_cRefDll);
    }

    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) {
        static const QITAB qitab[] = {
            QITABENT(CProviderFactory, IClassFactory),
            { 0 },
        };
        return QISearch(this, qitab, riid, ppv);
    }

    IFACEMETHODIMP_(ULONG) AddRef() {
        return InterlockedIncrement(&m_cRef);
    }

    IFACEMETHODIMP_(ULONG) Release() {
        LONG cRef = InterlockedDecrement(&m_cRef);
        if (cRef == 0) {
            delete this;
        }
        return cRef;
    }

    // IClassFactory
    IFACEMETHODIMP CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppv) {
        if (pUnkOuter) {
            return CLASS_E_NOAGGREGATION;
        }

        YCDeskCredentialProvider* pProvider = new YCDeskCredentialProvider();
        if (!pProvider) {
            return E_OUTOFMEMORY;
        }

        HRESULT hr = pProvider->QueryInterface(riid, ppv);
        pProvider->Release();

        return hr;
    }

    IFACEMETHODIMP LockServer(BOOL fLock) {
        if (fLock) {
            InterlockedIncrement(&g_cRefDll);
        } else {
            InterlockedDecrement(&g_cRefDll);
        }
        return S_OK;
    }

private:
    LONG m_cRef;
};

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        g_hinst = hModule;
        DisableThreadLibraryCalls(hModule);
        break;
    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}

STDAPI DllCanUnloadNow(void) {
    return g_cRefDll == 0 ? S_OK : S_FALSE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv) {
    *ppv = NULL;

    if (!IsEqualIID(rclsid, CLSID_YCDeskCredentialProvider)) {
        return CLASS_E_CLASSNOTAVAILABLE;
    }

    CProviderFactory* pFactory = new CProviderFactory();
    if (!pFactory) {
        return E_OUTOFMEMORY;
    }

    HRESULT hr = pFactory->QueryInterface(riid, ppv);
    pFactory->Release();

    return hr;
}

STDAPI DllRegisterServer(void) {
    HRESULT hr = E_FAIL;

    // Get the DLL path
    WCHAR szModule[MAX_PATH];
    if (GetModuleFileNameW(g_hinst, szModule, ARRAYSIZE(szModule)) == 0) {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    // Convert CLSID to string
    WCHAR szCLSID[39];
    if (StringFromGUID2(CLSID_YCDeskCredentialProvider, szCLSID, ARRAYSIZE(szCLSID)) == 0) {
        return E_FAIL;
    }

    // Create the registry keys
    HKEY hKey;
    WCHAR szSubKey[256];

    // HKCR\CLSID\{CLSID}
    wcscpy_s(szSubKey, ARRAYSIZE(szSubKey), L"CLSID\\");
    wcscat_s(szSubKey, ARRAYSIZE(szSubKey), szCLSID);

    if (RegCreateKeyExW(HKEY_CLASSES_ROOT, szSubKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL) == ERROR_SUCCESS) {
        // Default value
        SetKeyValue(hKey, NULL, L"YCDesk Credential Provider");

        // InprocServer32
        HKEY hSubKey;
        if (RegCreateKeyExW(hKey, L"InprocServer32", 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hSubKey, NULL) == ERROR_SUCCESS) {
            SetKeyValue(hSubKey, NULL, szModule);
            SetKeyValue(hSubKey, L"ThreadingModel", L"Apartment");
            RegCloseKey(hSubKey);
        }

        RegCloseKey(hKey);
    }

    // Register with Credential Providers
    wcscpy_s(szSubKey, ARRAYSIZE(szSubKey), L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\");
    wcscat_s(szSubKey, ARRAYSIZE(szSubKey), szCLSID);

    if (RegCreateKeyExW(HKEY_LOCAL_MACHINE, szSubKey, 0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL) == ERROR_SUCCESS) {
        SetKeyValue(hKey, NULL, L"YCDesk Credential Provider");
        RegCloseKey(hKey);
        hr = S_OK;
    }

    return hr;
}

STDAPI DllUnregisterServer(void) {
    // Convert CLSID to string
    WCHAR szCLSID[39];
    if (StringFromGUID2(CLSID_YCDeskCredentialProvider, szCLSID, ARRAYSIZE(szCLSID)) == 0) {
        return E_FAIL;
    }

    // Delete the registry keys
    WCHAR szSubKey[256];

    // HKCR\CLSID\{CLSID}
    wcscpy_s(szSubKey, ARRAYSIZE(szSubKey), L"CLSID\\");
    wcscat_s(szSubKey, ARRAYSIZE(szSubKey), szCLSID);
    SHDeleteKeyW(HKEY_CLASSES_ROOT, szSubKey);

    // HKLM\SOFTWARE\...\Credential Providers\{CLSID}
    wcscpy_s(szSubKey, ARRAYSIZE(szSubKey), L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\");
    wcscat_s(szSubKey, ARRAYSIZE(szSubKey), szCLSID);
    SHDeleteKeyW(HKEY_LOCAL_MACHINE, szSubKey);

    return S_OK;
}

