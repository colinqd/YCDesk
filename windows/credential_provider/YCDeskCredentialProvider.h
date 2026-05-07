
#pragma once

#include <windows.h>
#include <credentialprovider.h>
#include <shlwapi.h>
#include <objbase.h>
#include <strsafe.h>
#include <vector>
#include <ntsecapi.h>
#include <wtsapi32.h>
#include <sddl.h>
#include <propkey.h>

// CLSID for our provider: {A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
// This is DIFFERENT from RemoteDesk's CLSID to avoid conflicts
extern const GUID CLSID_YCDeskCredentialProvider;

// Field IDs
enum YCDESK_FIELD_ID {
    YCDFI_TILEIMAGE = 0,
    YCDFI_LARGETEXT = 1,
    YCDFI_SMALLTEXT = 2,
    YCDFI_USERNAME = 3,
    YCDFI_PASSWORD = 4,
    YCDFI_SUBMIT_BUTTON = 5,
    YCDFI_NUM_FIELDS = 6,
};

struct FIELD_STATE_PAIR {
    CREDENTIAL_PROVIDER_FIELD_STATE cpfs;
    CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE cpfis;
};

// Unlock IPC Client
class UnlockIpcClient {
public:
    UnlockIpcClient();
    ~UnlockIpcClient();

    bool Connect();
    bool Disconnect();
    bool RequestUnlock(_Outptr_result_z_ PWSTR* ppszUsername, _Outptr_result_z_ PWSTR* ppszPassword);

private:
    HANDLE _hPipe;
};

// Forward declaration
class YCDeskCredential;

class YCDeskCredentialProvider : public ICredentialProvider, public ICredentialProviderSetUserArray {
public:
    YCDeskCredentialProvider();

    // IUnknown
    IFACEMETHODIMP_(ULONG) AddRef();
    IFACEMETHODIMP_(ULONG) Release();
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv);

    // ICredentialProvider
    IFACEMETHODIMP SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, DWORD);
    IFACEMETHODIMP SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION*);
    IFACEMETHODIMP Advise(ICredentialProviderEvents*, UINT_PTR);
    IFACEMETHODIMP UnAdvise();
    IFACEMETHODIMP GetFieldDescriptorCount(DWORD* pdwCount);
    IFACEMETHODIMP GetFieldDescriptorAt(DWORD dwIndex, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd);
    IFACEMETHODIMP GetCredentialCount(DWORD* pdwCount, DWORD* pdwDefault, BOOL* pbAutoLogonWithDefault);
    IFACEMETHODIMP GetCredentialAt(DWORD dwIndex, ICredentialProviderCredential** ppcpc);

    // ICredentialProviderSetUserArray
    IFACEMETHODIMP SetUserArray(_In_ ICredentialProviderUserArray* users);

private:
    ~YCDeskCredentialProvider();
    HRESULT _EnumerateCredentials();
    HRESULT _CleanupCredentials();

    LONG _cRef;
    ICredentialProviderEvents* _pcpe;
    UINT_PTR _upAdviseContext;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO _cpus;
    std::vector<YCDeskCredential*> _rgpCredentials;
    ICredentialProviderUserArray* _pCredProviderUserArray;
    bool _bUnlockRequested;
    HANDLE _hUnlockPollTimer;
    bool _bUnlockNotified;

    static VOID CALLBACK _UnlockPollTimerCallback(PVOID lpParam, BOOLEAN TimerOrWaitFired);
    void CheckUnlockFlag();
};

class YCDeskCredential : public ICredentialProviderCredential, public ICredentialProviderCredential2, public ICredentialProviderCredentialWithFieldOptions {
public:
    YCDeskCredential(YCDeskCredentialProvider* pProvider);

    HRESULT Initialize(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, ICredentialProviderUser* pcpUser);

    // IUnknown
    IFACEMETHODIMP_(ULONG) AddRef();
    IFACEMETHODIMP_(ULONG) Release();
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv);

    // ICredentialProviderCredential
    IFACEMETHODIMP Advise(ICredentialProviderCredentialEvents* pcpce);
    IFACEMETHODIMP UnAdvise();
    IFACEMETHODIMP SetSelected(BOOL* pbAutoLogon);
    IFACEMETHODIMP SetDeselected();
    IFACEMETHODIMP GetFieldState(DWORD dwFieldID, CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs, CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis);
    IFACEMETHODIMP GetStringValue(DWORD dwFieldID, PWSTR* ppwsz);
    IFACEMETHODIMP GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp);
    IFACEMETHODIMP GetCheckboxValue(DWORD dwFieldID, BOOL* pbChecked, PWSTR* ppwszLabel);
    IFACEMETHODIMP GetSubmitButtonValue(DWORD dwFieldID, DWORD* pdwAdjacentTo);
    IFACEMETHODIMP GetComboBoxValueCount(DWORD dwFieldID, DWORD* pcItems, DWORD* pdwSelectedItem);
    IFACEMETHODIMP GetComboBoxValueAt(DWORD dwFieldID, DWORD dwItem, PWSTR* ppwszItem);
    IFACEMETHODIMP SetStringValue(DWORD dwFieldID, PCWSTR pwz);
    IFACEMETHODIMP SetCheckboxValue(DWORD dwFieldID, BOOL bChecked);
    IFACEMETHODIMP SetComboBoxSelectedValue(DWORD dwFieldID, DWORD dwSelectedItem);
    IFACEMETHODIMP CommandLinkClicked(DWORD dwFieldID);
    IFACEMETHODIMP GetSerialization(
        CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr,
        CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
        PWSTR* ppwszOptionalStatusText,
        CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon);
    IFACEMETHODIMP ReportResult(NTSTATUS ntsStatus, NTSTATUS ntsSubstatus, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon);

    // ICredentialProviderCredential2
    IFACEMETHODIMP GetUserSid(_Outptr_result_maybenull_ PWSTR* ppszSid);

    // ICredentialProviderCredentialWithFieldOptions
    IFACEMETHODIMP GetFieldOptions(DWORD dwFieldID, _Out_ CREDENTIAL_PROVIDER_CREDENTIAL_FIELD_OPTIONS* pcpcfo);

    void autoFillUsername();

    // Auto-unlock state tracking
    bool _bHasAttemptedAutoUnlock;      // Track if we've tried auto-unlock
    bool _bAutoUnlockFailed;             // Track if auto-unlock failed
    int _nEmptyPasswordCount;            // Count consecutive empty password attempts
    static const int MAX_EMPTY_PASSWORD_ATTEMPTS = 2;  // Switch to manual after 2 failures

    friend class YCDeskCredentialProvider;

private:
    ~YCDeskCredential();

    LONG _cRef;
    YCDeskCredentialProvider* _pProvider;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO _cpus;
    ICredentialProviderCredentialEvents* _pcpce;
    CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR _rgCredProvFieldDescriptors[YCDFI_NUM_FIELDS];
    PWSTR _rgFieldStrings[YCDFI_NUM_FIELDS];
    FIELD_STATE_PAIR _rgFieldStatePairs[YCDFI_NUM_FIELDS];
    PWSTR _pszUserSid;
    PWSTR _pszQualifiedUserName;
};
