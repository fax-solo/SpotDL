import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const PUBLIC = resolve(import.meta.dirname, 'public')
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
    console.error('ERROR: App icon.png not found at', SOURCE_ICON)
    console.error('Place your 1024x1024 PNG logo at the project root as "App icon.png"')
    process.exit(1)
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
  const drawableDir = resolve(PUBLIC, 'drawable')
  mkdirSync(drawableDir, { recursive: true })
  const foreground = resolve(drawableDir, 'ic_launcher_foreground.png')
  execSync(`${convertCmd} "${SOURCE_ICON}" -resize 108x108 "${foreground}"`, { stdio: 'pipe' })
  const fgKb = (existsSync(foreground) ? readFileSync(foreground).length / 1024 : 0).toFixed(1)
  console.log(`  drawable/ic_launcher_foreground.png  → 108x108  (${fgKb}KB)`)

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

  console.log('\nDone! All Android icons generated.')
}

main().catch(err => {
  console.error('Icon generation failed:', err.message)
  process.exit(1)
})
