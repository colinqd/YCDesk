
#include "UnlockIpcServer.h"
#include <stdio.h>

UnlockIpcServer::UnlockIpcServer() 
    : _hThread(nullptr), _hStopEvent(nullptr), _bRunning(false),
      _hasStoredCredentials(false) {
    InitializeCriticalSection(&_cs);
}

UnlockIpcServer::~UnlockIpcServer() {
    Stop();
    DeleteCriticalSection(&_cs);
}

bool UnlockIpcServer::Start(UnlockCallback callback) {
    if (_bRunning) {
        return true;
    }

    _callback = callback;
    _hStopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!_hStopEvent) {
        wprintf(L"Failed to create stop event: %lu\n", GetLastError());
        return false;
    }

    _bRunning = true;
    _hThread = CreateThread(nullptr, 0, ServerThread, this, 0, nullptr);
    if (!_hThread) {
        wprintf(L"Failed to create server thread: %lu\n", GetLastError());
        CloseHandle(_hStopEvent);
        _hStopEvent = nullptr;
        _bRunning = false;
        return false;
    }

    Sleep(100);
    
    wprintf(L"IPC Server started successfully\n");
    return true;
}

void UnlockIpcServer::Stop() {
    if (!_bRunning) {
        return;
    }

    _bRunning = false;

    if (_hStopEvent) {
        SetEvent(_hStopEvent);
    }

    if (_hThread) {
        WaitForSingleObject(_hThread, 5000);
        CloseHandle(_hThread);
        _hThread = nullptr;
    }

    if (_hStopEvent) {
        CloseHandle(_hStopEvent);
        _hStopEvent = nullptr;
    }
}

bool UnlockIpcServer::QueueUnlockRequest(const std::wstring& username, const std::wstring& password) {
    EnterCriticalSection(&_cs);
    _storedUsername = username;
    _storedPassword = password;
    _hasStoredCredentials = true;
    LeaveCriticalSection(&_cs);
    wprintf(L"QueueUnlockRequest: username=%s, password_len=%zu\n", username.c_str(), password.length());
    return true;
}

bool UnlockIpcServer::SetCredentials(const std::wstring& username, const std::wstring& password) {
    EnterCriticalSection(&_cs);
    _storedUsername = username;
    _storedPassword = password;
    _hasStoredCredentials = true;
    LeaveCriticalSection(&_cs);
    wprintf(L"SetCredentials: username=%s, password_len=%zu\n", username.c_str(), password.length());
    return true;
}

void UnlockIpcServer::ClearCredentials() {
    EnterCriticalSection(&_cs);
    _storedUsername.clear();
    _storedPassword.clear();
    _hasStoredCredentials = false;
    LeaveCriticalSection(&_cs);
    wprintf(L"ClearCredentials: credentials cleared\n");
}

DWORD WINAPI UnlockIpcServer::ServerThread(LPVOID lpParam) {
    UnlockIpcServer* pThis = static_cast<UnlockIpcServer*>(lpParam);
    pThis->ServerLoop();
    return 0;
}

void UnlockIpcServer::ServerLoop() {
    const wchar_t* pipeName = L"\\\\.\\pipe\\RemoteDeskUnlock";

    SECURITY_ATTRIBUTES sa;
    SECURITY_DESCRIPTOR sd;
    InitializeSecurityDescriptor(&sd, SECURITY_DESCRIPTOR_REVISION);
    SetSecurityDescriptorDacl(&sd, TRUE, NULL, FALSE);
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.lpSecurityDescriptor = &sd;
    sa.bInheritHandle = FALSE;

    while (_bRunning) {
        HANDLE hPipe = CreateNamedPipeW(
            pipeName,
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            PIPE_UNLIMITED_INSTANCES,
            4096,
            4096,
            0,
            &sa
        );

        if (hPipe == INVALID_HANDLE_VALUE) {
            DWORD dwError = GetLastError();
            wprintf(L"CreateNamedPipe failed: %lu\n", dwError);
            Sleep(1000);
            continue;
        }

        if (ConnectNamedPipe(hPipe, nullptr) || GetLastError() == ERROR_PIPE_CONNECTED) {
            HandleClient(hPipe);
        }

        CloseHandle(hPipe);
    }
}

void UnlockIpcServer::HandleClient(HANDLE hPipe) {
    wchar_t buffer[4096] = {};
    DWORD dwRead = 0;

    wprintf(L"HandleClient: waiting for request...\n");

    if (ReadFile(hPipe, buffer, sizeof(buffer), &dwRead, nullptr)) {
        wprintf(L"HandleClient: received request: %s\n", buffer);
        
        if (wcsncmp(buffer, L"REQUEST_UNLOCK", 14) == 0) {
            EnterCriticalSection(&_cs);
            bool hasRequest = _hasStoredCredentials;
            std::wstring username = _storedUsername;
            std::wstring password = _storedPassword;
            wprintf(L"HandleClient: hasRequest=%d, username=%s, password_len=%zu\n", 
                hasRequest, username.c_str(), password.length());
            LeaveCriticalSection(&_cs);

            if (hasRequest && !password.empty()) {
                wchar_t response[4096] = {};
                size_t usernameLen = username.length();
                size_t passwordLen = password.length();
                
                if (usernameLen + passwordLen + 2 < 4096) {
                    wcscpy_s(response, 4096, username.c_str());
                    wcscpy_s(response + usernameLen + 1, 4096 - usernameLen - 1, password.c_str());
                    
                    wprintf(L"HandleClient: sending response with credentials\n");
                    DWORD dwWritten = 0;
                    WriteFile(hPipe, response, static_cast<DWORD>((usernameLen + passwordLen + 2) * sizeof(wchar_t)), &dwWritten, nullptr);
                    
                    // Clear credentials after use for security
                    ClearCredentials();
                    wprintf(L"HandleClient: credentials cleared after use\n");
                }
            } else {
                wprintf(L"HandleClient: no pending request or empty password, sending empty response\n");
                wchar_t empty[2] = {0};
                DWORD dwWritten = 0;
                WriteFile(hPipe, empty, 2 * sizeof(wchar_t), &dwWritten, nullptr);
            }
        }
        else if (wcsncmp(buffer, L"SET_CREDENTIALS", 15) == 0) {
            wchar_t* data = buffer + 16;
            size_t dataLen = (dwRead / sizeof(wchar_t)) - 16;
            
            wchar_t* nullPos = wcschr(data, L'\0');
            if (nullPos && nullPos - data < (ptrdiff_t)dataLen) {
                std::wstring username(data);
                std::wstring password(nullPos + 1);
                
                wprintf(L"SET_CREDENTIALS: username=%s, password_len=%zu\n", username.c_str(), password.length());
                
                EnterCriticalSection(&_cs);
                _storedUsername = username;
                _storedPassword = password;
                _hasStoredCredentials = true;
                LeaveCriticalSection(&_cs);
                
                wchar_t response[] = L"OK";
                DWORD dwWritten = 0;
                WriteFile(hPipe, response, sizeof(response), &dwWritten, nullptr);
            } else {
                wchar_t response[] = L"ERROR";
                DWORD dwWritten = 0;
                WriteFile(hPipe, response, sizeof(response), &dwWritten, nullptr);
            }
        }
    }

    FlushFileBuffers(hPipe);
    DisconnectNamedPipe(hPipe);
}
