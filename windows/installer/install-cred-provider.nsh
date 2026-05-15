!macro customInstall
  DetailPrint "正在安装 YCDesk Credential Provider..."

  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
  ${EndIf}

  SetOutPath "$INSTDIR\resources\cred-provider"

  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Classes\CLSID\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}\InprocServer32" ""
  ${If} ${Errors}
    ${OrIf} $0 == ""
    WriteRegStr HKLM "SOFTWARE\Classes\CLSID\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" "" "YCDesk Credential Provider"
    WriteRegStr HKLM "SOFTWARE\Classes\CLSID\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}\InprocServer32" "" "$INSTDIR\resources\cred-provider\YCDeskCredentialProvider.dll"
    WriteRegStr HKLM "SOFTWARE\Classes\CLSID\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}\InprocServer32" "ThreadingModel" "Apartment"
  ${EndIf}

  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" ""
  ${If} ${Errors}
    ${OrIf} $0 == ""
    WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}" "" "YCDesk Credential Provider"
  ${EndIf}

  WriteRegStr HKLM "SOFTWARE\YCDesk" "InstallPath" "$INSTDIR"

  ExecWait '"$SYSDIR\regsvr32.exe" /s "$INSTDIR\resources\cred-provider\YCDeskCredentialProvider.dll"'

  ${If} ${RunningX64}
    ${EnableX64FSRedirection}
  ${EndIf}

  DetailPrint "YCDesk Credential Provider 安装完成"
!macroend

!macro customUnInstall
  DetailPrint "正在卸载 YCDesk Credential Provider..."

  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
  ${EndIf}

  ExecWait '"$SYSDIR\regsvr32.exe" /u /s "$INSTDIR\resources\cred-provider\YCDeskCredentialProvider.dll"'

  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
  DeleteRegKey HKLM "SOFTWARE\Classes\CLSID\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
  DeleteRegKey HKLM "SOFTWARE\YCDesk"

  ${If} ${RunningX64}
    ${EnableX64FSRedirection}
  ${EndIf}

  DetailPrint "YCDesk Credential Provider 已卸载"
!macroend