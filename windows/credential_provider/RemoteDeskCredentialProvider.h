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

// CLSID for our provider: {12345678-1234-1234-1234-567890ABCDEF}
static const GUID CLSID_RemoteDeskCredentialProvider = {
    0x12345678, 0x1234, 0x1234, { 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef }
};

// Field IDs
enum SAMPLE_FIELD_ID
{
    SFI_TILEIMAGE = 0,
    SFI_LARGETEXT = 1,
    SFI_SMALLTEXT = 2,
    SFI_USERNAME = 3,
    SFI_PASSWORD = 4,
    SFI_SUBMIT_BUTTON = 5,
    SFI_NUM_FIELDS = 6,
};

struct FIELD_STATE_PAIR
{
    CREDENTIAL_PROVIDER_FIELD_STATE cpfs;
    CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE cpfis;
};

// Unlock IPC Client
class UnlockIpcClient
{
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
class RemoteDeskCredential;

class RemoteDeskCredentialProvider : public ICredentialProvider, public ICredentialProviderSetUserArray
{
public:
    RemoteDeskCredentialProvider();

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
    ~RemoteDeskCredentialProvider();
    HRESULT _EnumerateCredentials();
    HRESULT _CleanupCredentials();

    LONG _cRef;
    ICredentialProviderEvents* _pcpe;
    UINT_PTR _upAdviseContext;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO _cpus;
    std::vector<RemoteDeskCredential*> _rgpCredentials;
    ICredentialProviderUserArray* _pCredProviderUserArray;
};

class RemoteDeskCredential : public ICredentialProviderCredential, public ICredentialProviderCredential2, public ICredentialProviderCredentialWithFieldOptions
{
public:
    RemoteDeskCredential(RemoteDeskCredentialProvider* pProvider);

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
    IFACEMETHODIMP GetComboBoxValueCount(DWORD dwFieldID, DWORD* pdwItems, DWORD* pdwSelectedItem);
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

public:
    ~RemoteDeskCredential();
private:
    HRESULT _InitializeFieldDescriptors();
    HRESULT _PackageCredentials(_Out_ CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs);
    HRESULT _CheckForPendingUnlockRequest();

    LONG _cRef;
    RemoteDeskCredentialProvider* _pProvider;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO _cpus;
    ICredentialProviderCredentialEvents* _pcpce;
    CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR _rgCredProvFieldDescriptors[SFI_NUM_FIELDS];
    PWSTR _rgFieldStrings[SFI_NUM_FIELDS];
    FIELD_STATE_PAIR _rgFieldStatePairs[SFI_NUM_FIELDS];
    PWSTR _pszUserSid;
    PWSTR _pszQualifiedUserName;
    PWSTR _pszUsername;
    PWSTR _pszPassword;
};
