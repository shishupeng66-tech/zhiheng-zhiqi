# HLG -> SDR Tone Mapping Comparison Test
# 生成 6 个对照版本 + 参考帧，所有版本使用相同参数，唯一变量是 tone mapping 方式

$ffmpeg = "D:\知衡智企\bin\ffmpeg\ffmpeg.exe"
$ffprobe = "D:\知衡智企\bin\ffmpeg\ffprobe.exe"
$src = "D:\知衡智企数据库\企业知识库\浩明饮品\知识库\08_人工样片拆解\04_样片004\afeae50bd4f303d9739d0626b1b663e7_raw.mp4"
$outDir = "D:\知衡智企\tmp\zhiheng-renderer\hdr-tonemap-comparison"
$framesDir = "$outDir\frames"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $framesDir | Out-Null

# 固定参数
$sourceStart = "2.000"
$duration = "3.000"
$width = 1080
$height = 1920
$fps = 30

# 通用 scale/crop（与正式 Renderer 一致）
$scaleCrop = "scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}"

# 通用输出参数
$outputArgs = @(
    "-r", "$fps",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-color_range", "tv",
    "-an",
    "-f", "mp4",
    "-movflags", "+faststart",
    "-y"
)

# 定义 6 个版本
$versions = @(
    @{
        name = "A-current"
        desc = "当前正式版本: zscale npl=100 + tonemap hable desat=0.5 peak=100"
        vf = "$scaleCrop,zscale=t=linear:npl=100,tonemap=hable:desat=0.5:peak=100,zscale=t=bt709:m=bt709:p=bt709:r=tv,fps=$fps,format=yuv420p10le"
    },
    @{
        name = "B-hable-auto-peak"
        desc = "Hable, 不手动指定 peak (自动检测)"
        vf = "$scaleCrop,zscale=t=linear:npl=100,tonemap=hable:desat=0.5,zscale=t=bt709:m=bt709:p=bt709:r=tv,fps=$fps,format=yuv420p10le"
    },
    @{
        name = "C-hable-desat02"
        desc = "Hable, desat=0.2 (更低去饱和, 更鲜艳), 不指定 peak"
        vf = "$scaleCrop,zscale=t=linear:npl=100,tonemap=hable:desat=0.2,zscale=t=bt709:m=bt709:p=bt709:r=tv,fps=$fps,format=yuv420p10le"
    },
    @{
        name = "D-mobius"
        desc = "Mobius tone mapping, 不指定 peak"
        vf = "$scaleCrop,zscale=t=linear:npl=100,tonemap=mobius,zscale=t=bt709:m=bt709:p=bt709:r=tv,fps=$fps,format=yuv420p10le"
    },
    @{
        name = "E-reinhard"
        desc = "Reinhard tone mapping, 不指定 peak"
        vf = "$scaleCrop,zscale=t=linear:npl=100,tonemap=reinhard,zscale=t=bt709:m=bt709:p=bt709:r=tv,fps=$fps,format=yuv420p10le"
    },
    @{
        name = "F-libplacebo-hable"
        desc = "libplacebo HDR->SDR, hable tonemapping, peak_detect"
        vf = "$scaleCrop,libplacebo=w=${width}:h=${height}:format=yuv420p10le:colorspace=bt709:color_primaries=bt709:color_trc=bt709:tonemapping=hable:peak_detect=1,fps=$fps"
    }
)

Write-Output "========================================"
Write-Output "HLG -> SDR Tone Mapping Comparison"
Write-Output "========================================"
Write-Output "Source: $src"
Write-Output "sourceStart: $sourceStart, duration: $duration"
Write-Output "Output: ${width}x${height}, ${fps}fps, H.264 yuv420p BT.709"
Write-Output ""

# 生成每个版本
foreach ($v in $versions) {
    $outFile = "$outDir\$($v.name).mp4"
    Write-Output "[$($v.name)] $($v.desc)"
    
    $args = @(
        "-hide_banner", "-loglevel", "error",
        "-ss", $sourceStart,
        "-i", $src,
        "-t", $duration,
        "-vf", $v.vf
    ) + $outputArgs + @($outFile)
    
    $result = & $ffmpeg @args 2>&1
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0 -and (Test-Path $outFile)) {
        $size = (Get-Item $outFile).Length
        Write-Output "  OK: $([math]::Round($size/1MB,2)) MB"
    } else {
        Write-Output "  FAILED: exit=$exitCode"
        Write-Output "  $result"
    }
}

# 生成参考帧（从原视频直接提取，默认 autorotate，不做 tone mapping）
Write-Output ""
Write-Output "[REFERENCE] 从原视频提取参考帧（默认 autorotate，不做 tone mapping）"
$refFrames = @("0.5", "1.5", "2.5")
foreach ($t in $refFrames) {
    $refOut = "$framesDir\REFERENCE_t${t}.png"
    & $ffmpeg -hide_banner -loglevel error -y -ss $t -i $src -frames:v 1 -vf "scale=540:960" $refOut 2>&1
    if (Test-Path $refOut) {
        Write-Output "  OK: REFERENCE_t${t}.png"
    }
}

# 每个版本抽取 0.5s/1.5s/2.5s 帧
Write-Output ""
Write-Output "抽取各版本帧 (0.5s / 1.5s / 2.5s)..."
foreach ($v in $versions) {
    $videoFile = "$outDir\$($v.name).mp4"
    if (-not (Test-Path $videoFile)) { continue }
    
    foreach ($t in $refFrames) {
        $frameOut = "$framesDir\$($v.name)_t${t}.jpg"
        & $ffmpeg -hide_banner -loglevel error -y -ss $t -i $videoFile -frames:v 1 -vf "scale=540:960" $frameOut 2>&1
    }
    Write-Output "  $($v.name): 3 frames extracted"
}

Write-Output ""
Write-Output "========================================"
Write-Output "完成！输出目录: $outDir"
Write-Output "帧目录: $framesDir"
Write-Output "========================================"
