
#pragma once

#include <windows.h>
#include <string>
#include <functional>

class UnlockIpcServer {
public:
    using UnlockCallback = std::function<void(const std::wstring& username, const std::wstring& password)>;

    UnlockIpcServer();
    ~UnlockIpcServer();

    bool Start(UnlockCallback callback);
    void Stop();

    bool QueueUnlockRequest(const std::wstring& username, const std::wstring& password);
    bool SetCredentials(const std::wstring& username, const std::wstring& password);
    void ClearCredentials();

private:
    static DWORD WINAPI ServerThread(LPVOID lpParam);
    void ServerLoop();
    void HandleClient(HANDLE hPipe);

    HANDLE _hThread;
    HANDLE _hStopEvent;
    UnlockCallback _callback;
    bool _bRunning;

    std::wstring _storedUsername;
    std::wstring _storedPassword;
    bool _hasStoredCredentials;
    CRITICAL_SECTION _cs;
};
