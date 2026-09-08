@echo off
setlocal
set FF=D:\JianyingPro\10.6.0.14057\ffmpeg.exe
set FR=D:\知衡智企\desktop\runtime-src\assets\golden-test\frames
set OUT=D:\知衡智企\desktop\runtime-src\assets\golden-test\videos
if not exist "%OUT%" mkdir "%OUT%"

call :enc 01_aseptic_filling 12
call :enc 02_bottling_line 14
call :enc 03_warehouse 12
call :enc 04_quality_check 10
call :enc 05_labeling_pack 12
call :enc 06_raw_material 10
call :enc 07_shipping 12
call :enc 08_rd_sampling 14
echo ALL DONE
exit /b 0

:enc
"%FF%" -y -loop 1 -i "%FR%\%~1.png" -f lavfi -i "sine=frequency=440:duration=%~2" -c:v h264_mf -preset veryfast -crf 26 -c:a aac -t %~2 -shortest -movflags +faststart "%OUT%\%~1.mp4" >nul 2>&1
if %errorlevel%==0 (echo OK %~1) else (echo FAIL %~1)
exit /b 0
