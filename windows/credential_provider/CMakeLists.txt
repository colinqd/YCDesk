cmake_minimum_required(VERSION 3.15)
project(YCDeskCredentialProvider VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# YCDesk Credential Provider DLL
add_library(YCDeskCredentialProvider SHARED
    YCDeskCredentialProvider.cpp
    dllmain.cpp
)

target_include_directories(YCDeskCredentialProvider PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

target_link_libraries(YCDeskCredentialProvider
    shlwapi
    ole32
    advapi32
    secur32
    wtsapi32
    gdi32
    credui
    crypt32
)

# Set DLL properties
set_target_properties(YCDeskCredentialProvider PROPERTIES
    PREFIX ""
)

# Define DEF file content
file(GENERATE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/YCDeskCredentialProvider.def CONTENT
"LIBRARY \"YCDeskCredentialProvider\"
EXPORTS
    DllGetClassObject
    DllCanUnloadNow
    DllRegisterServer
    DllUnregisterServer
"
)

target_sources(YCDeskCredentialProvider PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/YCDeskCredentialProvider.def)
