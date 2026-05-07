
# 🔐 Credential Provider 详细实施方案

---

## 📋 项目概述

实现一个 Windows Credential Provider COM 组件，在 Winlogon 安全桌面中运行，通过命名管道与 YCDesk Electron 主进程通信，实现远程自动解锁。

---

## 🏗️ 技术架构

```
YCDesk Electron (主控端)
    ↓
发送解锁指令 (包含凭据)
    ↓
YCDesk Named Pipe Server (Node.js)
    ↓
YCDesk Credential Provider (DLL, 运行在 Winlogon.exe 中)
    ↓
GetSerialization → pbAutoLogon = TRUE → 自动登录
```

---

## 📁 文件结构

```
windows/
├── credential_provider/
│   ├── CMakeLists.txt
│   ├── README.md
│   ├── build/
│   │   └── (CMake 构建输出)
│   ├── inc/
│   │   ├── YCDeskProvider.h
│   │   ├── YCDeskCredential.h
│   │   └── NamedPipeClient.h
│   ├── src/
│   │   ├── dllmain.cpp
│   │   ├── YCDeskProvider.cpp
│   │   ├── YCDeskCredential.cpp
│   │   ├── NamedPipeClient.cpp
│   │   └── ClassFactory.cpp
│   ├── YCDeskProvider.def
│   └── (Visual Studio 项目文件可选)
├── resources/
│   ├── install-cred-provider.ps1
│   ├── uninstall-cred-provider.ps1
│   └── register-cred-provider.reg
└── src/
    └── main/
        ├── named-pipe-server.js
        └── credential-provider-manager.js
```

---

## 🛠️ 详细实现步骤

---

## 步骤 1：创建 C++ 基础项目结构

### 1.1 CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.15)
project(YCDeskProvider)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Windows SDK 路径
set(CMAKE_SYSTEM_VERSION "10.0")

# 源文件
set(SOURCES
    src/dllmain.cpp
    src/YCDeskProvider.cpp
    src/YCDeskCredential.cpp
    src/NamedPipeClient.cpp
    src/ClassFactory.cpp
)

# 头文件
set(HEADERS
    inc/YCDeskProvider.h
    inc/YCDeskCredential.h
    inc/NamedPipeClient.h
)

# 创建 DLL
add_library(YCDeskProvider SHARED ${SOURCES} ${HEADERS})

# 链接库
target_link_libraries(YCDeskProvider
    credui
    rpcrt4
    advapi32
    kernel32
)

# DEF 文件
target_sources(YCDeskProvider PRIVATE YCDeskProvider.def)

# 包含目录
target_include_directories(YCDeskProvider PRIVATE inc)

# Unicode 定义
target_compile_definitions(YCDeskProvider PRIVATE
    UNICODE
    _UNICODE
    _WIN32_WINNT=0x0601
)

# 输出名称
set_target_properties(YCDeskProvider PROPERTIES
    OUTPUT_NAME "YCDeskCredentialProvider"
)
```

### 1.2 YCDeskProvider.def

```def
LIBRARY "YCDeskCredentialProvider"

EXPORTS
    DllGetClassObject
    DllCanUnloadNow
```

### 1.3 dllmain.cpp

```cpp
#include &lt;windows.h&gt;
#include &lt;objbase.h&gt;

// {GUID} - 需要生成唯一的 GUID
const CLSID CLSID_YCDeskProvider = 
    { 0x12345678, 0x1234, 0x1234, { 0x12, 0x34, 0x12, 0x34, 0x12, 0x34, 0x12, 0x34 } };

HMODULE g_hInstance = nullptr;
long g_cServerRef = 0;

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
        case DLL_PROCESS_ATTACH:
            g_hInstance = hModule;
            DisableThreadLibraryCalls(hModule);
            break;
        case DLL_THREAD_ATTACH:
        case DLL_THREAD_DETACH:
        case DLL_PROCESS_DETACH:
            break;
    }
    return TRUE;
}

STDAPI DllCanUnloadNow() {
    return g_cServerRef == 0 ? S_OK : S_FALSE;
}

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv) {
    if (rclsid != CLSID_YCDeskProvider) {
        return CLASS_E_CLASSNOTAVAILABLE;
    }
    
    // 创建 Class Factory
    // ...
    
    return S_OK;
}
```

---

## 步骤 2：实现 NamedPipeClient

### 2.1 NamedPipeClient.h

```cpp
#pragma once
#include &lt;windows.h&gt;
#include &lt;string&gt;

#define YCDESK_PIPE_NAME L"\\\\.\\pipe\\YCDeskUnlockPipe"
#define YCDESK_PIPE_MAGIC 0x5943444B  // "YCDK"

struct UnlockRequest {
    DWORD magic;
    DWORD version;
    DWORD usernameLen;
    DWORD passwordLen;
    // 后面跟着用户名和密码的 UTF-16 数据
};

struct UnlockResponse {
    DWORD magic;
    DWORD status;
    DWORD usernameLen;
    DWORD passwordLen;
    // 后面跟着用户名和密码的 UTF-16 数据
};

class NamedPipeClient {
public:
    NamedPipeClient();
    ~NamedPipeClient();
    
    bool Connect();
    void Disconnect();
    bool RequestUnlock(std::wstring&amp; username, std::wstring&amp; password);
    bool HasPendingUnlock();
    
private:
    HANDLE m_hPipe;
    bool ReadPipe(void* buffer, DWORD size);
    bool WritePipe(const void* buffer, DWORD size);
};
```

### 2.2 NamedPipeClient.cpp

```cpp
#include "NamedPipeClient.h"
#include &lt;thread&gt;
#include &lt;chrono&gt;

NamedPipeClient::NamedPipeClient() : m_hPipe(INVALID_HANDLE_VALUE) {
}

NamedPipeClient::~NamedPipeClient() {
    Disconnect();
}

bool NamedPipeClient::Connect() {
    if (m_hPipe != INVALID_HANDLE_VALUE) {
        return true;
    }
    
    for (int i = 0; i &lt; 5; i++) {
        m_hPipe = CreateFileW(
            YCDESK_PIPE_NAME,
            GENERIC_READ | GENERIC_WRITE,
            0,
            nullptr,
            OPEN_EXISTING,
            0,
            nullptr
        );
        
        if (m_hPipe != INVALID_HANDLE_VALUE) {
            DWORD mode = PIPE_READMODE_BYTE;
            SetNamedPipeHandleState(m_hPipe, &amp;mode, nullptr, nullptr);
            return true;
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
    
    return false;
}

void NamedPipeClient::Disconnect() {
    if (m_hPipe != INVALID_HANDLE_VALUE) {
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
    }
}

bool NamedPipeClient::HasPendingUnlock() {
    if (!Connect()) {
        return false;
    }
    
    // 发送查询请求
    UnlockRequest req;
    req.magic = YCDESK_PIPE_MAGIC;
    req.version = 1;
    req.usernameLen = 0;
    req.passwordLen = 0;
    
    if (!WritePipe(&amp;req, sizeof(req))) {
        return false;
    }
    
    // 读取响应
    UnlockResponse resp;
    if (!ReadPipe(&amp;resp, sizeof(resp))) {
        return false;
    }
    
    return resp.magic == YCDESK_PIPE_MAGIC &amp;&amp; resp.status == 1;
}

bool NamedPipeClient::RequestUnlock(std::wstring&amp; username, std::wstring&amp; password) {
    if (!Connect()) {
        return false;
    }
    
    UnlockRequest req;
    req.magic = YCDESK_PIPE_MAGIC;
    req.version = 1;
    req.usernameLen = 0;
    req.passwordLen = 0;
    
    if (!WritePipe(&amp;req, sizeof(req))) {
        return false;
    }
    
    UnlockResponse resp;
    if (!ReadPipe(&amp;resp, sizeof(resp))) {
        return false;
    }
    
    if (resp.magic != YCDESK_PIPE_MAGIC || resp.status != 1) {
        return false;
    }
    
    if (resp.usernameLen &gt; 0) {
        std::vector&lt;wchar_t&gt; userBuffer(resp.usernameLen / sizeof(wchar_t));
        if (ReadPipe(userBuffer.data(), resp.usernameLen)) {
            username = std::wstring(userBuffer.data(), userBuffer.size());
        }
    }
    
    if (resp.passwordLen &gt; 0) {
        std::vector&lt;wchar_t&gt; passBuffer(resp.passwordLen / sizeof(wchar_t));
        if (ReadPipe(passBuffer.data(), resp.passwordLen)) {
            password = std::wstring(passBuffer.data(), passBuffer.size());
        }
    }
    
    return true;
}

bool NamedPipeClient::ReadPipe(void* buffer, DWORD size) {
    DWORD bytesRead = 0;
    return ReadFile(m_hPipe, buffer, size, &amp;bytesRead, nullptr) &amp;&amp; bytesRead == size;
}

bool NamedPipeClient::WritePipe(const void* buffer, DWORD size) {
    DWORD bytesWritten = 0;
    return WriteFile(m_hPipe, buffer, size, &amp;bytesWritten, nullptr) &amp;&amp; bytesWritten == size;
}
```

---

## 步骤 3：实现 YCDeskCredential

### 3.1 YCDeskCredential.h

```cpp
#pragma once
#include &lt;windows.h&gt;
#include &lt;credentialprovider.h&gt;
#include &lt;string&gt;
#include "NamedPipeClient.h"

class YCDeskCredential : public ICredentialProviderCredential,
                         public ICredentialProviderCredential2 {
public:
    YCDeskCredential();
    virtual ~YCDeskCredential();
    
    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override;
    IFACEMETHODIMP_(ULONG) AddRef() override;
    IFACEMETHODIMP_(ULONG) Release() override;
    
    // ICredentialProviderCredential
    IFACEMETHODIMP Advise(ICredentialProviderCredentialEvents* pcpce) override;
    IFACEMETHODIMP UnAdvise() override;
    IFACEMETHODIMP SetSelected(BOOL* pbAutoLogon) override;
    IFACEMETHODIMP SetDeselected() override;
    IFACEMETHODIMP GetFieldState(DWORD dwFieldID, CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs, CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis) override;
    IFACEMETHODIMP GetStringValue(DWORD dwFieldID, PWSTR* ppwsz) override;
    IFACEMETHODIMP GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp) override;
    IFACEMETHODIMP GetCheckboxValue(DWORD dwFieldID, BOOL* pbChecked, PWSTR* ppwszLabel) override;
    IFACEMETHODIMP GetSubmitButtonValue(DWORD dwFieldID, DWORD* pdwAdjacentTo) override;
    IFACEMETHODIMP GetComboBoxValueCount(DWORD dwFieldID, DWORD* pcItems, DWORD* pdwSelectedItem) override;
    IFACEMETHODIMP GetComboBoxValueAt(DWORD dwFieldID, DWORD dwItem, PWSTR* ppwszItem) override;
    IFACEMETHODIMP SetStringValue(DWORD dwFieldID, PCWSTR pwz) override;
    IFACEMETHODIMP SetCheckboxValue(DWORD dwFieldID, BOOL bChecked) override;
    IFACEMETHODIMP SetComboBoxSelectedValue(DWORD dwFieldID, DWORD dwSelectedItem) override;
    IFACEMETHODIMP CommandLinkClicked(DWORD dwFieldID) override;
    IFACEMETHODIMP GetSerialization(CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr, CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) override;
    IFACEMETHODIMP ReportResult(NTSTATUS ntsStatus, NTSTATUS ntsSubstatus, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) override;
    
    // ICredentialProviderCredential2
    IFACEMETHODIMP GetUserSid(PWSTR* ppszSid) override;
    
    void Initialize();
    
private:
    long m_cRef;
    ICredentialProviderCredentialEvents* m_pCredProvCredentialEvents;
    NamedPipeClient m_pipeClient;
    std::wstring m_username;
    std::wstring m_password;
    
    // 字段定义
    enum FIELD_ID {
        FID_MESSAGE = 0,
        FID_NUM_FIELDS
    };
};
```

### 3.2 YCDeskCredential.cpp

```cpp
#include "YCDeskCredential.h"
#include &lt;credential.h&gt;
#include &lt;winternl.h&gt;
#include &lt;ntsecapi.h&gt;
#include &lt;vector&gt;

YCDeskCredential::YCDeskCredential() : m_cRef(1), m_pCredProvCredentialEvents(nullptr) {
}

YCDeskCredential::~YCDeskCredential() {
    if (m_pCredProvCredentialEvents) {
        m_pCredProvCredentialEvents-&gt;Release();
    }
}

IFACEMETHODIMP YCDeskCredential::QueryInterface(REFIID riid, void** ppv) {
    static const QITAB qit[] = {
        QITABENT(YCDeskCredential, ICredentialProviderCredential),
        QITABENT(YCDeskCredential, ICredentialProviderCredential2),
        { 0 },
    };
    return QISearch(this, qit, riid, ppv);
}

IFACEMETHODIMP_(ULONG) YCDeskCredential::AddRef() {
    return InterlockedIncrement(&amp;m_cRef);
}

IFACEMETHODIMP_(ULONG) YCDeskCredential::Release() {
    long cRef = InterlockedDecrement(&amp;m_cRef);
    if (cRef == 0) {
        delete this;
    }
    return cRef;
}

IFACEMETHODIMP YCDeskCredential::Advise(ICredentialProviderCredentialEvents* pcpce) {
    if (m_pCredProvCredentialEvents) {
        m_pCredProvCredentialEvents-&gt;Release();
    }
    m_pCredProvCredentialEvents = pcpce;
    if (m_pCredProvCredentialEvents) {
        m_pCredProvCredentialEvents-&gt;AddRef();
    }
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::UnAdvise() {
    if (m_pCredProvCredentialEvents) {
        m_pCredProvCredentialEvents-&gt;Release();
        m_pCredProvCredentialEvents = nullptr;
    }
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::SetSelected(BOOL* pbAutoLogon) {
    *pbAutoLogon = TRUE;  // 关键：自动登录
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::SetDeselected() {
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetFieldState(DWORD dwFieldID, CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs, CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis) {
    *pcpfs = CPFS_HIDDEN;  // 隐藏所有字段，静默模式
    *pcpfis = CPFIS_NONE;
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetStringValue(DWORD dwFieldID, PWSTR* ppwsz) {
    *ppwsz = nullptr;
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp) {
    *phbmp = nullptr;
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetCheckboxValue(DWORD dwFieldID, BOOL* pbChecked, PWSTR* ppwszLabel) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetSubmitButtonValue(DWORD dwFieldID, DWORD* pdwAdjacentTo) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetComboBoxValueCount(DWORD dwFieldID, DWORD* pcItems, DWORD* pdwSelectedItem) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetComboBoxValueAt(DWORD dwFieldID, DWORD dwItem, PWSTR* ppwszItem) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::SetStringValue(DWORD dwFieldID, PCWSTR pwz) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::SetCheckboxValue(DWORD dwFieldID, BOOL bChecked) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::SetComboBoxSelectedValue(DWORD dwFieldID, DWORD dwSelectedItem) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::CommandLinkClicked(DWORD dwFieldID) {
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskCredential::GetSerialization(CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr, CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) {
    *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
    *ppwszOptionalStatusText = nullptr;
    *pcpsiOptionalStatusIcon = CPSI_NONE;
    
    ZeroMemory(pcpcs, sizeof(*pcpcs));
    
    // 检查是否有解锁请求
    if (!m_pipeClient.RequestUnlock(m_username, m_password)) {
        return S_OK;
    }
    
    // 构造 KERB_INTERACTIVE_UNLOCK_LOGON
    // ... (详细的凭据序列化逻辑)
    
    *pcpgsr = CPGSR_RETURN_CREDENTIAL_FINISHED;
    
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::ReportResult(NTSTATUS ntsStatus, NTSTATUS ntsSubstatus, PWSTR* ppwszOptionalStatusText, CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) {
    *ppwszOptionalStatusText = nullptr;
    *pcpsiOptionalStatusIcon = CPSI_NONE;
    return S_OK;
}

IFACEMETHODIMP YCDeskCredential::GetUserSid(PWSTR* ppszSid) {
    *ppszSid = nullptr;
    return S_OK;
}

void YCDeskCredential::Initialize() {
}
```

---

## 步骤 4：实现 YCDeskProvider

### 4.1 YCDeskProvider.h

```cpp
#pragma once
#include &lt;windows.h&gt;
#include &lt;credentialprovider.h&gt;
#include &lt;vector&gt;
#include "NamedPipeClient.h"

class YCDeskProvider : public ICredentialProvider,
                       public ICredentialProviderSetUserArray {
public:
    YCDeskProvider();
    virtual ~YCDeskProvider();
    
    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override;
    IFACEMETHODIMP_(ULONG) AddRef() override;
    IFACEMETHODIMP_(ULONG) Release() override;
    
    // ICredentialProvider
    IFACEMETHODIMP SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, DWORD dwFlags) override;
    IFACEMETHODIMP SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs) override;
    IFACEMETHODIMP Advise(ICredentialProviderEvents* pcpe, UINT_PTR upAdviseContext) override;
    IFACEMETHODIMP UnAdvise() override;
    IFACEMETHODIMP GetFieldDescriptorCount(DWORD* pdwCount) override;
    IFACEMETHODIMP GetFieldDescriptorAt(DWORD dwIndex, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd) override;
    IFACEMETHODIMP GetCredentialCount(DWORD* pdwCount, DWORD* pdwDefault, BOOL* pbAutoLogonWithDefault) override;
    IFACEMETHODIMP GetCredentialAt(DWORD dwIndex, ICredentialProviderCredential** ppcpc) override;
    
    // ICredentialProviderSetUserArray
    IFACEMETHODIMP SetUserArray(ICredentialProviderUserArray* users) override;
    
private:
    long m_cRef;
    ICredentialProviderEvents* m_pCredProvEvents;
    UINT_PTR m_upAdviseContext;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO m_cpus;
    NamedPipeClient m_pipeClient;
    YCDeskCredential* m_pCredential;
    
    void _ReleaseEnumeratedCredentials();
    void _EnumerateCredentials();
};
```

### 4.2 YCDeskProvider.cpp

```cpp
#include "YCDeskProvider.h"
#include "YCDeskCredential.h"

YCDeskProvider::YCDeskProvider() : m_cRef(1), m_pCredProvEvents(nullptr), m_cpus(CPUS_INVALID), m_pCredential(nullptr) {
}

YCDeskProvider::~YCDeskProvider() {
    _ReleaseEnumeratedCredentials();
    if (m_pCredProvEvents) {
        m_pCredProvEvents-&gt;Release();
    }
}

IFACEMETHODIMP YCDeskProvider::QueryInterface(REFIID riid, void** ppv) {
    static const QITAB qit[] = {
        QITABENT(YCDeskProvider, ICredentialProvider),
        QITABENT(YCDeskProvider, ICredentialProviderSetUserArray),
        { 0 },
    };
    return QISearch(this, qit, riid, ppv);
}

IFACEMETHODIMP_(ULONG) YCDeskProvider::AddRef() {
    return InterlockedIncrement(&amp;m_cRef);
}

IFACEMETHODIMP_(ULONG) YCDeskProvider::Release() {
    long cRef = InterlockedDecrement(&amp;m_cRef);
    if (cRef == 0) {
        delete this;
    }
    return cRef;
}

IFACEMETHODIMP YCDeskProvider::SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus, DWORD dwFlags) {
    m_cpus = cpus;
    return S_OK;
}

IFACEMETHODIMP YCDeskProvider::SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs) {
    return S_OK;
}

IFACEMETHODIMP YCDeskProvider::Advise(ICredentialProviderEvents* pcpe, UINT_PTR upAdviseContext) {
    if (m_pCredProvEvents) {
        m_pCredProvEvents-&gt;Release();
    }
    m_pCredProvEvents = pcpe;
    if (m_pCredProvEvents) {
        m_pCredProvEvents-&gt;AddRef();
    }
    m_upAdviseContext = upAdviseContext;
    return S_OK;
}

IFACEMETHODIMP YCDeskProvider::UnAdvise() {
    if (m_pCredProvEvents) {
        m_pCredProvEvents-&gt;Release();
        m_pCredProvEvents = nullptr;
    }
    m_upAdviseContext = 0;
    return S_OK;
}

IFACEMETHODIMP YCDeskProvider::GetFieldDescriptorCount(DWORD* pdwCount) {
    *pdwCount = 0;
    return S_OK;
}

IFACEMETHODIMP YCDeskProvider::GetFieldDescriptorAt(DWORD dwIndex, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd) {
    *ppcpfd = nullptr;
    return E_NOTIMPL;
}

IFACEMETHODIMP YCDeskProvider::GetCredentialCount(DWORD* pdwCount, DWORD* pdwDefault, BOOL* pbAutoLogonWithDefault) {
    *pdwCount = 0;
    *pdwDefault = 0;
    *pbAutoLogonWithDefault = FALSE;
    
    _EnumerateCredentials();
    
    if (m_pCredential &amp;&amp; m_pipeClient.HasPendingUnlock()) {
        *pdwCount = 1;
        *pdwDefault = 0;
        *pbAutoLogonWithDefault = TRUE;  // 关键：自动登录
    }
    
    return S_OK;
}

IFACEMETHODIMP YCDeskProvider::GetCredentialAt(DWORD dwIndex, ICredentialProviderCredential** ppcpc) {
    if (dwIndex == 0 &amp;&amp; m_pCredential) {
        *ppcpc = m_pCredential;
        m_pCredential-&gt;AddRef();
        return S_OK;
    }
    *ppcpc = nullptr;
    return E_INVALIDARG;
}

IFACEMETHODIMP YCDeskProvider::SetUserArray(ICredentialProviderUserArray* users) {
    return S_OK;
}

void YCDeskProvider::_ReleaseEnumeratedCredentials() {
    if (m_pCredential) {
        m_pCredential-&gt;Release();
        m_pCredential = nullptr;
    }
}

void YCDeskProvider::_EnumerateCredentials() {
    _ReleaseEnumeratedCredentials();
    
    if (m_pipeClient.HasPendingUnlock()) {
        m_pCredential = new YCDeskCredential();
        m_pCredential-&gt;Initialize();
    }
}
```

---

## 步骤 5：实现 ClassFactory

### 5.1 ClassFactory.cpp

```cpp
#include &lt;windows.h&gt;
#include &lt;objbase.h&gt;
#include "YCDeskProvider.h"

extern long g_cServerRef;
extern const CLSID CLSID_YCDeskProvider;

class ClassFactory : public IClassFactory {
public:
    ClassFactory() : m_cRef(1) {
        InterlockedIncrement(&amp;g_cServerRef);
    }
    
    virtual ~ClassFactory() {
        InterlockedDecrement(&amp;g_cServerRef);
    }
    
    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) {
        static const QITAB qit[] = {
            QITABENT(ClassFactory, IClassFactory),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }
    
    IFACEMETHODIMP_(ULONG) AddRef() {
        return InterlockedIncrement(&amp;m_cRef);
    }
    
    IFACEMETHODIMP_(ULONG) Release() {
        long cRef = InterlockedDecrement(&amp;m_cRef);
        if (cRef == 0) {
            delete this;
        }
        return cRef;
    }
    
    IFACEMETHODIMP CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppv) {
        if (pUnkOuter) {
            return CLASS_E_NOAGGREGATION;
        }
        
        YCDeskProvider* pProvider = new YCDeskProvider();
        HRESULT hr = pProvider-&gt;QueryInterface(riid, ppv);
        pProvider-&gt;Release();
        
        return hr;
    }
    
    IFACEMETHODIMP LockServer(BOOL fLock) {
        if (fLock) {
            InterlockedIncrement(&amp;g_cServerRef);
        } else {
            InterlockedDecrement(&amp;g_cServerRef);
        }
        return S_OK;
    }
    
private:
    long m_cRef;
};

STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv) {
    *ppv = nullptr;
    
    if (rclsid != CLSID_YCDeskProvider) {
        return CLASS_E_CLASSNOTAVAILABLE;
    }
    
    ClassFactory* pFactory = new ClassFactory();
    HRESULT hr = pFactory-&gt;QueryInterface(riid, ppv);
    pFactory-&gt;Release();
    
    return hr;
}
```

---

## 步骤 6：实现 Node.js 命名管道服务端

### 6.1 named-pipe-server.js

```javascript
const net = require('net');
const path = require('path');
const logger = require('./logger');

const PIPE_NAME = '\\\\.\\pipe\\YCDeskUnlockPipe';
const PIPE_MAGIC = 0x5943444B; // 'YCDK'

class NamedPipeServer {
  constructor() {
    this.server = null;
    this.pendingUnlock = null;
    this.clients = [];
  }
  
  start() {
    this.server = net.createServer((client) =&gt; {
      logger.info('[NamedPipeServer] Credential Provider 已连接');
      this.clients.push(client);
      
      let buffer = Buffer.alloc(0);
      
      client.on('data', (data) =&gt; {
        buffer = Buffer.concat([buffer, data]);
        this._handleData(client, buffer);
      });
      
      client.on('end', () =&gt; {
        logger.info('[NamedPipeServer] Credential Provider 已断开');
        const idx = this.clients.indexOf(client);
        if (idx !== -1) {
          this.clients.splice(idx, 1);
        }
      });
      
      client.on('error', (err) =&gt; {
        logger.error('[NamedPipeServer] 错误:', err);
      });
    });
    
    this.server.on('error', (err) =&gt; {
      logger.error('[NamedPipeServer] 服务端错误:', err);
    });
    
    this.server.listen(PIPE_NAME, () =&gt; {
      logger.info('[NamedPipeServer] 服务已启动');
    });
  }
  
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
  
  setUnlockCredentials(username, password) {
    this.pendingUnlock = {
      username: username || '',
      password: password || ''
    };
    logger.info('[NamedPipeServer] 解锁凭据已设置');
  }
  
  clearUnlockCredentials() {
    this.pendingUnlock = null;
    logger.info('[NamedPipeServer] 解锁凭据已清除');
  }
  
  _handleData(client, buffer) {
    const headerSize = 12; // magic(4) + version(4) + usernameLen(4) + passwordLen(4)
    if (buffer.length &lt; headerSize) {
      return;
    }
    
    const magic = buffer.readUInt32LE(0);
    if (magic !== PIPE_MAGIC) {
      logger.warn('[NamedPipeServer] 无效的魔数');
      return;
    }
    
    const resp = Buffer.alloc(headerSize);
    resp.writeUInt32LE(PIPE_MAGIC, 0);
    
    if (this.pendingUnlock) {
      resp.writeUInt32LE(1, 4); // status = 1 (有解锁请求)
      
      const userBuf = Buffer.from(this.pendingUnlock.username, 'utf16le');
      const passBuf = Buffer.from(this.pendingUnlock.password, 'utf16le');
      
      resp.writeUInt32LE(userBuf.length, 8);
      resp.writeUInt32LE(passBuf.length, 12);
      
      client.write(Buffer.concat([resp, userBuf, passBuf]));
      
      logger.info('[NamedPipeServer] 解锁凭据已发送给 Credential Provider');
      
      // 立即清除，避免重复解锁
      setTimeout(() =&gt; {
        this.clearUnlockCredentials();
      }, 2000);
    } else {
      resp.writeUInt32LE(0, 4); // status = 0 (无请求)
      resp.writeUInt32LE(0, 8);
      resp.writeUInt32LE(0, 12);
      client.write(resp);
    }
  }
}

module.exports = new NamedPipeServer();
```

---

## 步骤 7：实现 Credential Provider 管理器

### 7.1 credential-provider-manager.js

```javascript
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const RESOURCES_DIR = path.join(__dirname, '../../resources');
const PROVIDER_DLL_NAME = 'YCDeskCredentialProvider.dll';
const PROVIDER_DLL_PATH = path.join(RESOURCES_DIR, PROVIDER_DLL_NAME);

class CredentialProviderManager {
  constructor() {
    this.isInstalled = false;
  }
  
  async checkInstallStatus() {
    try {
      const { exec } = require('child_process');
      // 检查注册表中的 CLSID
      // ...
      return false;
    } catch (err) {
      logger.error('[CredProvManager] 检查安装状态失败:', err);
      return false;
    }
  }
  
  async install() {
    logger.info('[CredProvManager] 开始安装 Credential Provider');
    
    if (!fs.existsSync(PROVIDER_DLL_PATH)) {
      throw new Error('Credential Provider DLL 未找到');
    }
    
    const scriptPath = path.join(RESOURCES_DIR, 'install-cred-provider.ps1');
    
    try {
      await this._runPowerShellScript(scriptPath);
      this.isInstalled = true;
      logger.info('[CredProvManager] Credential Provider 安装成功');
      return true;
    } catch (err) {
      logger.error('[CredProvManager] 安装失败:', err);
      throw err;
    }
  }
  
  async uninstall() {
    logger.info('[CredProvManager] 开始卸载 Credential Provider');
    
    const scriptPath = path.join(RESOURCES_DIR, 'uninstall-cred-provider.ps1');
    
    try {
      await this._runPowerShellScript(scriptPath);
      this.isInstalled = false;
      logger.info('[CredProvManager] Credential Provider 卸载成功');
      return true;
    } catch (err) {
      logger.error('[CredProvManager] 卸载失败:', err);
      throw err;
    }
  }
  
  async _runPowerShellScript(scriptPath) {
    const { exec } = require('child_process');
    const { path: _path } = require('path');
    
    return new Promise((resolve, reject) =&gt; {
      const cmd = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;
      
      exec(cmd, { 
        windowsVerbatimArguments: true,
        shell: true 
      }, (error, stdout, stderr) =&gt; {
        if (error) {
          logger.error('PowerShell 执行失败:', stderr);
          reject(error);
        } else {
          logger.info('PowerShell 执行成功:', stdout);
          resolve();
        }
      });
    });
  }
}

module.exports = new CredentialProviderManager();
```

---

## 步骤 8：实现安装/卸载脚本

### 8.1 install-cred-provider.ps1

```powershell
#requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DllPath = Join-Path $ScriptDir "YCDeskCredentialProvider.dll"
$System32Dir = [Environment]::GetFolderPath("System")
$TargetDllPath = Join-Path $System32Dir "YCDeskCredentialProvider.dll"

# 生成唯一 GUID
$guid = [guid]::NewGuid().ToString("B").ToUpper()

Write-Host "正在安装 YCDesk Credential Provider..."
Write-Host "CLSID: $guid"

# 1. 复制 DLL 到系统目录
if (Test-Path $TargetDllPath) {
    Write-Host "正在覆盖现有 DLL..."
    Remove-Item $TargetDllPath -Force
}

Copy-Item $DllPath $TargetDllPath -Force
Write-Host "DLL 已复制到 $TargetDllPath"

# 2. 注册 COM 组件
Write-Host "正在注册 COM 组件..."
regsvr32.exe /s $TargetDllPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "COM 注册失败"
    exit 1
}

# 3. 配置凭据提供程序
Write-Host "正在配置注册表..."
$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\$guid"

if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}

Set-ItemProperty -Path $regPath -Name "(default)" -Value "YCDesk Credential Provider"

# 设置为默认提供程序 (可选)
$credProvidersPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers"
if (-not (Test-Path "$credProvidersPath\$guid")) {
    New-Item -Path "$credProvidersPath\$guid" -Force | Out-Null
}

Write-Host "YCDesk Credential Provider 安装成功!"
```

### 8.2 uninstall-cred-provider.ps1

```powershell
#requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

Write-Host "正在卸载 YCDesk Credential Provider..."

$System32Dir = [Environment]::GetFolderPath("System")
$TargetDllPath = Join-Path $System32Dir "YCDeskCredentialProvider.dll"

# 1. 取消注册 COM 组件
if (Test-Path $TargetDllPath) {
    Write-Host "正在取消注册 COM 组件..."
    regsvr32.exe /s /u $TargetDllPath
}

# 2. 删除注册表项
$credProvidersPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers"
$subKeys = Get-ChildItem $credProvidersPath -ErrorAction SilentlyContinue

foreach ($key in $subKeys) {
    $val = (Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue)."(default)"
    if ($val -eq "YCDesk Credential Provider") {
        Write-Host "正在删除注册表项: $($key.PSChildName)"
        Remove-Item -Path $key.PSPath -Recurse -Force
    }
}

# 3. 删除 DLL
if (Test-Path $TargetDllPath) {
    Write-Host "正在删除 DLL..."
    Remove-Item $TargetDllPath -Force
}

Write-Host "YCDesk Credential Provider 卸载成功!"
```

---

## 步骤 9：集成到主程序

### 9.1 更新 auto-unlock-service.js

```javascript
const { powerMonitor, ipcMain } = require('electron');
const credentialsManager = require('./credentials-manager');
const namedPipeServer = require('./named-pipe-server');
const credProvManager = require('./credential-provider-manager');
const logger = require('./logger');

class AutoUnlockService {
  constructor() {
    this.isLocked = false;
    this.autoUnlockEnabled = false;
    this.currentRemoteWindow = null;
    this.currentMode = 'robotjs'; // 'robotjs' | 'credprov' | 'autologin'
    this.setupListeners();
  }
  
  async initialize() {
    try {
      namedPipeServer.start();
      const installed = await credProvManager.checkInstallStatus();
      logger.info('[AutoUnlock] Credential Provider 安装状态:', installed);
    } catch (err) {
      logger.error('[AutoUnlock] 初始化失败:', err);
    }
  }
  
  setAutoUnlockEnabled(enabled) {
    this.autoUnlockEnabled = enabled;
  }
  
  setRemoteWindow(window) {
    this.currentRemoteWindow = window;
  }
  
  setMode(mode) {
    this.currentMode = mode;
    logger.info('[AutoUnlock] 切换到模式:', mode);
  }
  
  setupListeners() {
    powerMonitor.on('lock-screen', () =&gt; {
      this.isLocked = true;
      logger.info('[AutoUnlock] 检测到屏幕锁定');
      this.notifyLockState();
    });
    
    powerMonitor.on('unlock-screen', () =&gt; {
      this.isLocked = false;
      logger.info('[AutoUnlock] 屏幕已解锁');
      this.notifyLockState();
      namedPipeServer.clearUnlockCredentials();
    });
    
    ipcMain.handle('auto-unlock:get-state', async () =&gt; {
      const savedPasswordResult = await credentialsManager.getUnlockPassword();
      const hasSavedPassword = savedPasswordResult.success &amp;&amp; savedPasswordResult.password !== null;
      const credProvInstalled = await credProvManager.checkInstallStatus();
      
      return {
        isLocked: this.isLocked,
        autoUnlockEnabled: this.autoUnlockEnabled,
        hasSavedPassword,
        credProvInstalled,
        currentMode: this.currentMode
      };
    });
    
    ipcMain.handle('auto-unlock:try', async () =&gt; {
      return await this.tryAutoUnlock();
    });
    
    ipcMain.handle('auto-unlock:manual', async (event, password) =&gt; {
      return await this.manualUnlock(password);
    });
    
    ipcMain.handle('auto-unlock:save-password', async (event, password, remember) =&gt; {
      return await credentialsManager.saveUnlockPassword(password, remember);
    });
    
    ipcMain.handle('auto-unlock:clear-password', async () =&gt; {
      return await credentialsManager.clearUnlockPassword();
    });
    
    ipcMain.handle('credprov:install', async () =&gt; {
      try {
        await credProvManager.install();
        return { success: true };
      } catch (err) {
        return { success: false, message: err.message };
      }
    });
    
    ipcMain.handle('credprov:uninstall', async () =&gt; {
      try {
        await credProvManager.uninstall();
        return { success: true };
      } catch (err) {
        return { success: false, message: err.message };
      }
    });
  }
  
  notifyLockState() {
    if (this.currentRemoteWindow &amp;&amp; !this.currentRemoteWindow.isDestroyed()) {
      this.currentRemoteWindow.webContents.send('unlock-state-changed', {
        isLocked: this.isLocked,
        autoUnlockEnabled: this.autoUnlockEnabled
      });
    }
  }
  
  async tryAutoUnlock() {
    if (!this.isLocked) {
      return { success: false, message: '屏幕未锁定' };
    }
    
    const { success, password, username } = await credentialsManager.getUnlockPassword();
    if (!success || !password) {
      return { success: false, message: '未保存解锁密码' };
    }
    
    return await this._doUnlock(username || '', password);
  }
  
  async manualUnlock(password) {
    if (!password) {
      return { success: false, message: '密码不能为空' };
    }
    
    const { username } = await credentialsManager.getUnlockPassword();
    return await this._doUnlock(username || '', password);
  }
  
  async _doUnlock(username, password) {
    try {
      if (this.currentMode === 'credprov') {
        logger.info('[AutoUnlock] 使用 Credential Provider 模式解锁');
        namedPipeServer.setUnlockCredentials(username, password);
        return { success: true, message: '解锁请求已发送' };
      } else {
        logger.info('[AutoUnlock] 使用 robotjs 模式解锁');
        await this.simulatePasswordInput(password);
        return { success: true, message: '自动解锁成功' };
      }
    } catch (error) {
      logger.error('[AutoUnlock] 解锁失败:', error);
      return { 
        success: false, 
        message: error.message || '解锁失败' 
      };
    }
  }
  
  async simulatePasswordInput(password) {
    let robot = null;
    try {
      robot = require('robotjs');
    } catch (e) {
      throw new Error('robotjs 不可用');
    }
    
    logger.info('[AutoUnlock] 开始模拟输入密码...');
    
    try {
      robot.keyTap('escape');
      await this.sleep(300);
    } catch (e) {
      logger.warn('[AutoUnlock] ESC 失败:', e.message);
    }
    
    try {
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const centerX = Math.floor(primaryDisplay.size.width / 2);
      const centerY = Math.floor(primaryDisplay.size.height / 2);
      
      robot.moveMouse(centerX, centerY);
      await this.sleep(100);
      robot.mouseClick();
      await this.sleep(200);
    } catch (e) {
      logger.warn('[AutoUnlock] 点击屏幕失败:', e.message);
    }
    
    try {
      robot.typeString(password);
      await this.sleep(200);
    } catch (e) {
      logger.error('[AutoUnlock] 输入密码失败:', e.message);
      throw new Error('密码输入失败');
    }
    
    try {
      robot.keyTap('enter');
    } catch (e) {
      logger.error('[AutoUnlock] Enter 失败:', e.message);
      throw new Error('Enter 失败');
    }
  }
  
  sleep(ms) {
    return new Promise(resolve =&gt; setTimeout(resolve, ms));
  }
}

module.exports = new AutoUnlockService();
```

---

## 📊 开发任务清单

- [ ] 生成唯一的 GUID
- [ ] 实现 CMakeLists.txt 和项目结构
- [ ] 实现 dllmain.cpp 和 ClassFactory
- [ ] 实现 NamedPipeClient
- [ ] 实现 YCDeskCredential（关键：GetSerialization）
- [ ] 实现 YCDeskProvider（关键：GetCredentialCount, pbAutoLogon）
- [ ] 实现 Node.js NamedPipeServer
- [ ] 实现 CredentialProviderManager
- [ ] 编写 PowerShell 安装/卸载脚本
- [ ] 集成到 auto-unlock-service.js
- [ ] 添加 UI 界面（安装/卸载按钮、模式选择）
- [ ] 测试：普通登录场景
- [ ] 测试：锁屏解锁场景
- [ ] 优化：错误处理和日志
- [ ] 安全：命名管道的安全描述符 (SDDL)

---

## ⚠️ 注意事项

1. **开发环境**：Visual Studio 2019+ 或 VS Code + CMake
2. **运行环境**：Windows 7+
3. **权限**：安装需要管理员权限
4. **调试**：Winlogon 中调试比较困难，建议先在普通进程中测试 NamedPipeClient
5. **安全**：考虑命名管道的 ACL 权限，避免未授权访问
6. **防病毒**：Credential Provider 可能被 AV/EDR 监控，需要申请白名单

---

## 📚 参考资料

- [Windows Credential Provider 文档](https://learn.microsoft.com/en-us/windows/win32/api/credentialprovider/)
- [Windows SDK 示例代码](https://github.com/microsoft/Windows-classic-samples/tree/main/Samples/CredentialProvider)

