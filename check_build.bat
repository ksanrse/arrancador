@echo off
echo Checking Rust backend compilation...
cd src-tauri
cargo check
if %errorlevel% neq 0 (
    echo [ERROR] Backend compilation failed!
    pause
    exit /b %errorlevel%
) else (
    echo [SUCCESS] Backend compiles successfully.
)

echo.
echo Checking Frontend compilation...
cd ..
call pnpm tsc
if %errorlevel% neq 0 (
    echo [ERROR] Frontend TypeScript errors found!
    pause
    exit /b %errorlevel%
) else (
    echo [SUCCESS] Frontend compiles successfully.
)

echo.
echo All checks passed! The app should launch.
pause
