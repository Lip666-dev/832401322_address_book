@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   通讯录 Address Book - 本地演示
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [!] 没有找到 python 命令。
    echo     可以先安装 Python 3.8+，或者用任意静态服务器打开本目录。
    echo     也可以直接双击 index.html 使用（功能相同，只是没有服务器）。
    echo.
    pause
    exit /b 1
)

start "" http://127.0.0.1:8021/
python serve.py --port 8021
pause
