import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const PUBLIC = resolve(import.meta.dirname, 'public')
const ANDROID_RES = resolve(import.meta.dirname, 'android/app/src/main/res')
const SOURCE_ICON = resolve(ROOT, 'App icon.png')

const MIPMAP_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
}

async function main() {
  if (!existsSync(SOURCE_ICON)) {
    console.warn('WARNING: App icon.png not found at', SOURCE_ICON)
    console.warn('Using pre-committed icons from public/. To customize, place a 1024x1024 PNG as "App icon.png" at the project root.')
    return
  }

  // Check that ImageMagick is available
  try {
    execSync('which convert', { stdio: 'ignore' })
  } catch {
    try {
      execSync('which magick', { stdio: 'ignore' })
    } catch {
      console.error('ERROR: ImageMagick (convert/magick) not found. Install it or use the pre-built icons.')
      process.exit(1)
    }
  }

  const convertCmd = (() => {
    try { execSync('which magick', { stdio: 'ignore' }); return 'magick' }
    catch { return 'convert' }
  })()

  console.log(`Generating Android icons from: ${SOURCE_ICON}`)

  // Generate mipmap launcher icons
  for (const [dir, size] of Object.entries(MIPMAP_SIZES)) {
    const outDir = resolve(PUBLIC, dir)
    mkdirSync(outDir, { recursive: true })

    const launcher = resolve(outDir, 'ic_launcher.png')
    const launcherRound = resolve(outDir, 'ic_launcher_round.png')

    execSync(`${convertCmd} "${SOURCE_ICON}" -resize ${size}x${size} "${launcher}"`, { stdio: 'pipe' })
    execSync(`${convertCmd} "${SOURCE_ICON}" -resize ${size}x${size} "${launcherRound}"`, { stdio: 'pipe' })

    const kb = (existsSync(launcher) ? readFileSync(launcher).length / 1024 : 0).toFixed(1)
    console.log(`  ${dir}/ic_launcher.png  → ${size}x${size}  (${kb}KB)`)
  }

  // Generate adaptive icon foreground (108x108)
  // Write to both drawable/ and drawable-v24/ to override Capacitor's default vector on API 24+
  for (const fgDir of ['drawable', 'drawable-v24']) {
    const outDir = resolve(PUBLIC, fgDir)
    mkdirSync(outDir, { recursive: true })
    const foreground = resolve(outDir, 'ic_launcher_foreground.png')
    execSync(`${convertCmd} "${SOURCE_ICON}" -resize 108x108 "${foreground}"`, { stdio: 'pipe' })
    const fgKb = (existsSync(foreground) ? readFileSync(foreground).length / 1024 : 0).toFixed(1)
    console.log(`  ${fgDir}/ic_launcher_foreground.png  → 108x108  (${fgKb}KB)`)
  }

  // Ensure adaptive icon XML descriptors exist
  const anydpiDir = resolve(PUBLIC, 'mipmap-anydpi-v26')
  mkdirSync(anydpiDir, { recursive: true })

  const icLauncherXml = resolve(anydpiDir, 'ic_launcher.xml')
  if (!existsSync(icLauncherXml)) {
    writeFileSync(icLauncherXml, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
`)
    copyFileSync(icLauncherXml, resolve(anydpiDir, 'ic_launcher_round.xml'))
    console.log('  Created adaptive icon XML descriptors')
  }

  // Ensure background color file exists
  const valuesDir = resolve(PUBLIC, 'values')
  mkdirSync(valuesDir, { recursive: true })
  const bgXml = resolve(valuesDir, 'ic_launcher_background.xml')
  if (!existsSync(bgXml)) {
    writeFileSync(bgXml, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B0F19</color>
</resources>
`)
    console.log('  Created icon background color XML')
  }

  // Copy to Android project
  if (existsSync(ANDROID_RES)) {
    console.log('\nCopying to Android project...')
    for (const [dir] of Object.entries(MIPMAP_SIZES)) {
      const srcDir = resolve(PUBLIC, dir)
      const dstDir = resolve(ANDROID_RES, dir)
      mkdirSync(dstDir, { recursive: true })
      copyFileSync(resolve(srcDir, 'ic_launcher.png'), resolve(dstDir, 'ic_launcher.png'))
      copyFileSync(resolve(srcDir, 'ic_launcher_round.png'), resolve(dstDir, 'ic_launcher_round.png'))
      const rmPath = resolve(dstDir, 'ic_launcher_foreground.png')
      if (existsSync(rmPath)) unlinkSync(rmPath)
      console.log(`  Copied ${dir} icons`)
    }

    // Foreground drawable
    const drawableDst = resolve(ANDROID_RES, 'drawable')
    mkdirSync(drawableDst, { recursive: true })
    copyFileSync(resolve(PUBLIC, 'drawable/ic_launcher_foreground.png'), resolve(drawableDst, 'ic_launcher_foreground.png'))
    console.log('  Copied adaptive icon foreground')

    // drawable-v24 — copy PNG and remove stale Capacitor default vector
    const v24Dst = resolve(ANDROID_RES, 'drawable-v24')
    mkdirSync(v24Dst, { recursive: true })
    const v24Xml = resolve(v24Dst, 'ic_launcher_foreground.xml')
    if (existsSync(v24Xml)) {
      unlinkSync(v24Xml)
      console.log('  Removed stale Capacitor default vector (drawable-v24)')
    }
    if (existsSync(resolve(PUBLIC, 'drawable-v24/ic_launcher_foreground.png'))) {
      copyFileSync(resolve(PUBLIC, 'drawable-v24/ic_launcher_foreground.png'), resolve(v24Dst, 'ic_launcher_foreground.png'))
      console.log('  Copied adaptive icon foreground (drawable-v24)')
    }

    // Background color
    const valuesDst = resolve(ANDROID_RES, 'values')
    mkdirSync(valuesDst, { recursive: true })
    const bgFile = resolve(PUBLIC, 'values/ic_launcher_background.xml')
    if (existsSync(bgFile)) copyFileSync(bgFile, resolve(valuesDst, 'ic_launcher_background.xml'))

    // Adaptive icon XML
    const anydpiDst = resolve(ANDROID_RES, 'mipmap-anydpi-v26')
    mkdirSync(anydpiDst, { recursive: true })
    copyFileSync(resolve(PUBLIC, 'mipmap-anydpi-v26/ic_launcher.xml'), resolve(anydpiDst, 'ic_launcher.xml'))
    copyFileSync(resolve(PUBLIC, 'mipmap-anydpi-v26/ic_launcher_round.xml'), resolve(anydpiDst, 'ic_launcher_round.xml'))

    console.log('  Copied adaptive icon XML descriptors')
    console.log('\nAndroid project icons updated!')
  } else {
    console.warn('\nAndroid project not found at', ANDROID_RES, '— skipping copy')
  }

  console.log('\nDone! All Android icons generated.')
}

main().catch(err => {
  console.error('Icon generation failed:', err.message)
  process.exit(1)
})
