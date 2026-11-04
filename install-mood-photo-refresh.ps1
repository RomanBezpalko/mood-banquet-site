$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

$ProjectRoot = (Get-Location).Path
$MainFile = Join-Path $ProjectRoot 'src\main.jsx'
$CssFile = Join-Path $ProjectRoot 'src\styles.css'
$PackageFile = Join-Path $ProjectRoot 'package.json'

$BackupDir = $null

function Select-MoodPhoto {
    param([string]$Prompt)

    Write-Host "`n$Prompt" -ForegroundColor Cyan

    $Dialog = New-Object System.Windows.Forms.OpenFileDialog
    $Dialog.Title = $Prompt
    $Dialog.Filter = 'Image files|*.jpg;*.jpeg;*.png;*.webp;*.avif'
    $Dialog.Multiselect = $false

    try {
        if ($Dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            throw 'Выбор фотографии отменён.'
        }

        return $Dialog.FileName
    }
    finally {
        $Dialog.Dispose()
    }
}

try {
    # Проверяем структуру проекта
    if (!(Test-Path $PackageFile) -or
        !(Test-Path $MainFile) -or
        !(Test-Path $CssFile)) {
        throw 'Запусти скрипт из корневой папки banquet-site.'
    }

    Write-Host 'ВЫБОР ФОТОГРАФИЙ MOOD' -ForegroundColor Green
    Write-Host 'Выбери фотографии в открывающихся окнах.'

    # Выбор фотографий
    $Photos = [ordered]@{}

    $Photos['hero-banquet'] = Select-MoodPhoto `
        '1/9 — Главное фото первого экрана: ресторан или банкетный стол'

    $Photos['space-banquet'] = Select-MoodPhoto `
        '2/9 — Пространство: интерьер или посадка гостей'

    $Photos['food-main'] = Select-MoodPhoto `
        '3/9 — Блюдо для блока меню'

    $Photos['event-romantic'] = Select-MoodPhoto `
        '4/9 — Праздник: оформление или романтическое событие'

    $Photos['gallery-banquet'] = Select-MoodPhoto `
        '5/9 — Галерея: интерьер ресторана'

    $Photos['gallery-terrace'] = Select-MoodPhoto `
        '6/9 — Галерея: терраса или внешний вид'

    $Photos['gallery-piano'] = Select-MoodPhoto `
        '7/9 — Галерея: атмосфера и детали интерьера'

    $Photos['gallery-brand-detail'] = Select-MoodPhoto `
        '8/9 — Галерея: сервировка и фирменные детали'

    $Photos['gallery-cocktails'] = Select-MoodPhoto `
        '9/9 — Галерея: кофе, напитки или коктейли'

    # Подготовка резервной копии
    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $BackupDir = Join-Path $ProjectRoot ".backup-mood-photo-refresh-$Stamp"

    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

    Copy-Item $MainFile (Join-Path $BackupDir 'main.jsx')
    Copy-Item $CssFile (Join-Path $BackupDir 'styles.css')

    $Destination = Join-Path $ProjectRoot 'public\images\mood-refresh'
    $HadDestination = Test-Path $Destination

    if ($HadDestination) {
        Copy-Item $Destination (Join-Path $BackupDir 'mood-refresh') -Recurse
    }

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null

    # Копируем фото, сохраняя исходные расширения
    $ImageUrls = @{}

    foreach ($Entry in $Photos.GetEnumerator()) {
        $Extension = [IO.Path]::GetExtension($Entry.Value).ToLowerInvariant()

        if ($Extension -notin @('.jpg', '.jpeg', '.png', '.webp', '.avif')) {
            throw "Неподдерживаемый формат: $Extension"
        }

        $FileName = $Entry.Key + $Extension
        $Target = Join-Path $Destination $FileName

        Copy-Item -LiteralPath $Entry.Value -Destination $Target -Force

        $ImageUrls[$Entry.Key] = "/images/mood-refresh/$FileName"
    }

    # Читаем JSX
    $MainText = [IO.File]::ReadAllText($MainFile, [Text.Encoding]::UTF8)

    # Обновляем массив фотографий галереи
    $GalleryPattern = '(?s)(function Gallery\(\)\s*\{\s*const photos\s*=\s*)\[[^\]]*\](\s*;)'

    $GalleryRegex = [regex]::new($GalleryPattern)

    if (!$GalleryRegex.IsMatch($MainText)) {
        throw 'Не найден ожидаемый блок Gallery в main.jsx.'
    }

    $GalleryArray = @(
        '"' + $ImageUrls['gallery-banquet'] + '"'
        '"' + $ImageUrls['gallery-terrace'] + '"'
        '"' + $ImageUrls['gallery-piano'] + '"'
        '"' + $ImageUrls['gallery-brand-detail'] + '"'
        '"' + $ImageUrls['gallery-cocktails'] + '"'
    ) -join ', '

    $MainText = $GalleryRegex.Replace(
        $MainText,
        ('$1[' + $GalleryArray + ']$2'),
        1
    )

    # Заменяем фотографии основных блоков
    $TokenMap = @{
        'IMG.hall' = '"' + $ImageUrls['space-banquet'] + '"'
        'IMG.food' = '"' + $ImageUrls['food-main'] + '"'
        'IMG.wedding' = '"' + $ImageUrls['event-romantic'] + '"'
    }

    foreach ($Token in $TokenMap.Keys) {
        if (!$MainText.Contains($Token)) {
            throw "Не найдено ожидаемое обозначение: $Token"
        }

        $MainText = $MainText.Replace($Token, $TokenMap[$Token])
    }

    # Обновляем подпись галереи
    $MainText = $MainText.Replace(
        'Фото використані як тимчасові візуальні матеріали. Перед запуском замініть їх на реальні світлини закладу.',
        'Ресторан, кухня та деталі MOOD — у світлинах із закладу.'
    )

    $MainText = $MainText.Replace(
        'Фото: тимчасові ілюстрації з фотобанків',
        'Фото: MOOD restaurant'
    )

    # Сохраняем JSX
    [IO.File]::WriteAllText(
        $MainFile,
        $MainText,
        (New-Object Text.UTF8Encoding($false))
    )

    # Обновляем CSS
    $CssText = [IO.File]::ReadAllText($CssFile, [Text.Encoding]::UTF8)

    # Удаляем прежний блок нашего патча, если он уже существует
    $Marker = '/* MOOD PHOTO REFRESH'

    $MarkerIndex = $CssText.IndexOf($Marker)

    if ($MarkerIndex -ge 0) {
        $CssText = $CssText.Substring(0, $MarkerIndex).TrimEnd()
    }

    $HeroUrl = $ImageUrls['hero-banquet']

    $CssPatch = @"

/* MOOD PHOTO REFRESH — existing layout and brand retained */
.hero {
    background-image: url("$HeroUrl") !important;
    background-position: center 48% !important;
}

.space-photo img {
    object-position: center 48%;
}

.menu-image img {
    object-position: center 50%;
}

.event-card img {
    object-position: center 42%;
}

.gallery-photo img {
    object-position: center;
}

@media (max-width: 600px) {
    .hero {
        background-position: center 44% !important;
    }

    .event-card img {
        object-position: center 38%;
    }
}
"@

    [IO.File]::WriteAllText(
        $CssFile,
        ($CssText + "`r`n" + $CssPatch),
        (New-Object Text.UTF8Encoding($false))
    )

    Write-Host "`nФОТОГРАФИИ MOOD ОБНОВЛЕНЫ" -ForegroundColor Green
    Write-Host "Резервная копия: $BackupDir"
    Write-Host "Новые фото: $Destination"

    Write-Host "`nТеперь запусти проверку:" -ForegroundColor Yellow
    Write-Host 'npm.cmd run qa'

}
catch {
    Write-Host "`nОШИБКА: $($_.Exception.Message)" -ForegroundColor Red

    # Восстанавливаем исходный код, если возникла ошибка после сохранения
    if ($BackupDir -and (Test-Path $BackupDir)) {
        if (Test-Path (Join-Path $BackupDir 'main.jsx')) {
            Copy-Item (Join-Path $BackupDir 'main.jsx') $MainFile -Force
        }

        if (Test-Path (Join-Path $BackupDir 'styles.css')) {
            Copy-Item (Join-Path $BackupDir 'styles.css') $CssFile -Force
        }

        Write-Host 'Исходные файлы кода восстановлены из резервной копии.' -ForegroundColor Yellow
    }

    exit 1
}
