const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createLogger } = require('./logger');

const logger = createLogger();

/**
 * 共享内存管理器
 * 用于与 Credential Provider 通信
 */
class SharedMemoryManager {
    constructor() {
        this.sharedMemoryName = 'Global\\YCDeskUnlockCredentials';
        this.helperPath = path.join(__dirname, 'shared-memory-helper.exe');
    }

    /**
     * 写入密码到共享内存
     * @param {string} password - 密码
     */
    async writePassword(password) {
        logger.info('[SharedMemoryManager] 写入密码到共享内存...');
        
        try {
            // 使用 temp ps1 脚本来实现，不需要编译 C++ 这么复杂
            // 先用简单的 PowerShell + C++ 临时文件方案
            const tempPs1 = path.join(os.tempdir(), `ycdesk_shm_${Date.now()}.ps1`);
            const tempCpp = path.join(os.tempdir(), `ycdesk_shm_helper.cpp`);
            
            const cppCode = `
#include <windows.h>
#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        return 1;
    }
    
    std::string password = argv[1];
    
    // 创建共享内存
    HANDLE hMapFile = CreateFileMappingA(
        INVALID_HANDLE_VALUE,
        NULL,
        PAGE_READWRITE,
        0,
        4096,
        "Global\\\\YCDeskUnlockCredentials");
    
    if (hMapFile == NULL) {
        return 2;
    }
    
    char* pBuf = (char*)MapViewOfFile(
        hMapFile,
        FILE_MAP_ALL_ACCESS,
        0,
        0,
        4096);
    
    if (pBuf == NULL) {
        CloseHandle(hMapFile);
        return 3;
    }
    
    // 写入密码
    CopyMemory((PVOID)pBuf, password.c_str(), password.size() + 1);
    
    UnmapViewOfFile(pBuf);
    // 不关闭句柄，保持共享内存打开
    // CloseHandle(hMapFile);
    
    return 0;
}
`;
            
            const ps1Code = `
# 临时 PowerShell 脚本
# 先检查是否有 cl.exe，如果没有，先用简单的内存映射方案
# 先用简单的方案，通过文件作为中介

$tempFile = "$env:TEMP\\ycdesk_unlock_password.dat"
$password = "${password}"
[System.IO.File]::WriteAllText($tempFile, $password)

# 尝试使用 .NET MemoryMappedFiles
try {
    Add-Type -TypeDefinition @'
    using System;
    using System.IO.MemoryMappedFiles;
    using System.Text;
    
    public class SharedMemoryHelper {
        public static void Write(string name, string data) {
            using (var mmf = MemoryMappedFile.CreateOrOpen(name, 4096)) {
                using (var stream = mmf.CreateViewStream()) {
                    byte[] buffer = Encoding.UTF8.GetBytes(data + '\\0');
                    stream.Write(buffer, 0, buffer.Length);
                }
            }
        }
    }
'@
    
    [SharedMemoryHelper]::Write("Global\\YCDeskUnlockCredentials", $password)
    Write-Host "SUCCESS_MEMORY_MAPPED"
}
catch {
    Write-Host "SUCCESS_FILE: $tempFile"
}
`;

            fs.writeFileSync(tempPs1, ps1Code);
            
            const psPath = path.join(process.env.SystemRoot || 'C:\\Windows', 
                'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            
            const result = await new Promise((resolve) => {
                const proc = spawn(psPath, [
                    '-NoProfile',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', tempPs1
                ], {
                    windowsHide: true
                });
                
                let stdout = '';
                proc.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
                
                proc.on('close', (code) => {
                    resolve({
                        success: code === 0,
                        output: stdout
                    });
                });
                
                proc.on('error', (err) => {
                    resolve({
                        success: false,
                        error: err.message
                    });
                });
            });
            
            logger.info('[SharedMemoryManager] 结果:', result);
            
            try { fs.unlinkSync(tempPs1); } catch (e) {}
            
            return result;
        }
        catch (error) {
            logger.error('[SharedMemoryManager] 错误:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 简单的密码写入（通过文件）
     * 这是保底方案
     */
    async writePasswordSimple(password) {
        try {
            const tempFile = path.join(os.tmpdir(), 'ycdesk_unlock_password.dat');
            fs.writeFileSync(tempFile, password, 'utf8');
            logger.info('[SharedMemoryManager] 密码已写入文件:', tempFile);
            return { success: true };
        } catch (error) {
            logger.error('[SharedMemoryManager] 错误:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 清除密码
     */
    async clearPassword() {
        try {
            const tempFile = path.join(os.tmpdir(), 'ycdesk_unlock_password.dat');
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            logger.info('[SharedMemoryManager] 密码已清除');
            return { success: true };
        } catch (error) {
            logger.error('[SharedMemoryManager] 错误:', error);
            return { success: false, error: error.message };
        }
    }
}

const sharedMemoryManager = new SharedMemoryManager();
module.exports = sharedMemoryManager;
