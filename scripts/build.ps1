#Requires -Version 7.0
<#
.SYNOPSIS
    构建 C++ -> Wasm 模块（simulate.html 使用）。

.DESCRIPTION
    环境由 pineload 管理，本脚本会自动激活：
        pineload cmake   # 把 cmake + ninja 加进 PATH
        pineload emcc    # 把 emsdk (emcc / emcmake) 加进 PATH
    然后 emcmake 配置 + Ninja 编译，产物写入 public/bin/。

.PARAMETER Clean
    先删掉 build/ 再重新配置、编译。

.PARAMETER EigenDir
    Eigen 头文件目录，默认 D:/Dev/Lib/cpp/eigen-5.0.0。

.EXAMPLE
    pwsh -File scripts/build.ps1
    pwsh -File scripts/build.ps1 -Clean
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [string]$EigenDir = 'D:/Dev/Lib/cpp/eigen-5.0.0'
)

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $PSScriptRoot   # scripts/ -> 仓库根
$BuildDir = Join-Path $Root 'build'
$BinDir   = Join-Path $Root 'public/bin'

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "找不到命令 '$Name'（pineload cmake / pineload emcc 是否成功？）"
    }
}

Write-Host '[build] 激活环境: pineload cmake' -ForegroundColor Cyan
pineload cmake | Out-Null
Write-Host '[build] 激活环境: pineload emcc' -ForegroundColor Cyan
pineload emcc | Out-Null

'cmake', 'ninja', 'emcc', 'emcmake' | ForEach-Object { Assert-Command $_ }

if ($Clean -and (Test-Path $BuildDir)) {
    Write-Host "[build] 清理 $BuildDir" -ForegroundColor Yellow
    Remove-Item -Recurse -Force $BuildDir
}

# 清掉旧产物：SINGLE_FILE 构建只产出 .js，避免遗留的 .wasm 与新 .js 混用
Remove-Item -Force (Join-Path $BinDir 'field_line.js'), (Join-Path $BinDir 'field_line.wasm') `
    -ErrorAction SilentlyContinue

if (-not (Test-Path (Join-Path $BuildDir 'CMakeCache.txt'))) {
    Write-Host '[build] configure (emcmake + Ninja)' -ForegroundColor Cyan
    emcmake cmake -S $Root -B $BuildDir -G Ninja `
        -DCMAKE_BUILD_TYPE=Release `
        -DEIGEN_DIR="$EigenDir"
    if ($LASTEXITCODE -ne 0) { throw 'cmake configure 失败' }
}

Write-Host '[build] 编译' -ForegroundColor Cyan
cmake --build $BuildDir
if ($LASTEXITCODE -ne 0) { throw '编译失败' }

Write-Host '[build] 产物:' -ForegroundColor Green
Get-ChildItem $BinDir -Filter 'field_line.*' |
    Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB, 1) } }
