import { ChangeEvent, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

const ASPECTS = {
  landscape: { label: '横 16:9', value: 16 / 9, shortLabel: '16:9' },
  portrait: { label: '縦 9:16', value: 9 / 16, shortLabel: '9:16' },
} as const
const COPYRIGHTS = {
  none: '',
  short: '© SQUARE ENIX',
  full: '(C) SQUARE ENIX CO., LTD. All Rights Reserved',
} as const

const FONTS = {
  greatVibes: { label: 'Great Vibes — 華やかな筆記体', family: 'Great Vibes' },
  allura: { label: 'Allura — 軽やかな筆記体', family: 'Allura' },
  cormorant: { label: 'Cormorant Garamond — 上品な書体', family: 'Cormorant Garamond' },
  marcellus: { label: 'Marcellus — 端正な書体', family: 'Marcellus' },
} as const

type CopyrightKey = keyof typeof COPYRIGHTS
type FontKey = keyof typeof FONTS
type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type OutputMode = 'single' | 'triple'
type AspectMode = keyof typeof ASPECTS
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Crop = { x: number; y: number; width: number; height: number }
type Drag = { handle: Handle; startX: number; startY: number; crop: Crop } | null

const LANDSCAPE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
const PORTRAIT_HANDLES = ['n', 's'] as const

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function initialCrop(width: number, height: number, aspect: number): Crop {
  const cropWidth = Math.min(width, height * aspect)
  const cropHeight = cropWidth / aspect
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight }
}

function createOutputFilePrefix() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `ff14-screenshot-16x9-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [crop, setCrop] = useState<Crop | null>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const [copyright, setCopyright] = useState<CopyrightKey>('short')
  const [position, setPosition] = useState<Position>('bottom-right')
  const [font, setFont] = useState<FontKey>('greatVibes')
  const [copyrightSize, setCopyrightSize] = useState(100)
  const [aspectMode, setAspectMode] = useState<AspectMode>('landscape')
  const [outputMode, setOutputMode] = useState<OutputMode>('single')
  const [outputUrls, setOutputUrls] = useState<string[]>([])
  const [outputFilePrefix, setOutputFilePrefix] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>(null)

  useEffect(() => { dragRef.current = drag }, [drag])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])
  useEffect(() => () => { outputUrls.forEach(url => URL.revokeObjectURL(url)) }, [outputUrls])

  const discardOutput = () => {
    outputUrls.forEach(url => URL.revokeObjectURL(url))
    setOutputUrls([])
    setOutputFilePrefix('')
  }

  const updateCrop = (next: Crop) => {
    discardOutput()
    setCrop(next)
  }

  const loadImageFile = (file: File) => {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('PNG または JPEG 形式の画像を選択してください。')
      return
    }
    setError(null)
    discardOutput()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageSize({ width: 0, height: 0 })
    setCrop(null)
    setImageUrl(URL.createObjectURL(file))
  }

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) loadImageFile(file)
    event.target.value = ''
  }

  const dragOverUpload = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDraggingFile(true)
  }

  const dropImage = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDraggingFile(false)
    const file = event.dataTransfer.files[0]
    if (file) loadImageFile(file)
  }

  const loadImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    if (!width || !height) return
    setImageSize({ width, height })
    const nextAspectMode: AspectMode = height > width ? 'portrait' : 'landscape'
    setAspectMode(nextAspectMode)
    setCrop(initialCrop(width, height, ASPECTS[nextAspectMode].value))
  }

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, handle: Handle) => {
    if (!crop || !stageRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ handle, startX: event.clientX, startY: event.clientY, crop })
  }

  const resizeCrop = (start: Crop, handle: Exclude<Handle, 'move'>, dx: number, dy: number): Crop => {
    const aspect = ASPECTS[aspectMode].value
    const minWidth = Math.min(180, imageSize.width, imageSize.height * aspect)
    const left = handle.includes('w')
    const right = handle.includes('e')
    const top = handle.includes('n')
    const bottom = handle.includes('s')
    let width = start.width
    let x = start.x
    let y = start.y

    if (left || right) {
      const horizontalDelta = (right ? 1 : -1) * dx
      const verticalDelta = (top ? -1 : 1) * dy * aspect
      const delta = top || bottom
        ? (Math.abs(horizontalDelta) > Math.abs(verticalDelta) ? horizontalDelta : verticalDelta)
        : horizontalDelta
      width = start.width + delta
    } else {
      width = start.width + (bottom ? dy : -dy) * aspect
    }

    const anchorX = left ? start.x + start.width : start.x
    const anchorY = top ? start.y + start.height : start.y
    const maxWidth = left
      ? anchorX
      : right
        ? imageSize.width - anchorX
        : imageSize.width
    width = clamp(width, minWidth, Math.min(maxWidth, imageSize.height * aspect))
    const height = width / aspect

    if (left) x = anchorX - width
    else if (!(right || top || bottom)) x = start.x
    else if (top || bottom) x = start.x + (start.width - width) / 2
    if (top) y = anchorY - height
    else if (bottom) y = start.y
    else y = start.y + (start.height - height) / 2

    x = clamp(x, 0, imageSize.width - width)
    y = clamp(y, 0, imageSize.height - height)
    return { x, y, width, height }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current
    if (!current || !stageRef.current) return
    const bounds = stageRef.current.getBoundingClientRect()
    const scale = imageSize.width / bounds.width
    const dx = (event.clientX - current.startX) * scale
    const dy = (event.clientY - current.startY) * scale
    const next = current.handle === 'move'
      ? {
          ...current.crop,
          x: clamp(current.crop.x + dx, 0, imageSize.width - current.crop.width),
          y: clamp(current.crop.y + dy, 0, imageSize.height - current.crop.height),
        }
      : resizeCrop(current.crop, current.handle, dx, dy)
    updateCrop(next)
  }

  const finishDrag = () => setDrag(null)

  const changeSetting = <T,>(setter: (value: T) => void, value: T) => {
    discardOutput()
    setter(value)
  }

  const changeAspectMode = (nextMode: AspectMode) => {
    if (nextMode === aspectMode) return
    discardOutput()
    setAspectMode(nextMode)
    if (imageSize.width && imageSize.height) {
      setCrop(initialCrop(imageSize.width, imageSize.height, ASPECTS[nextMode].value))
    }
  }

  const generate = async () => {
    if (!imageUrl || !crop) return
    setIsGenerating(true)
    setError(null)
    try {
      await document.fonts.load(`48px "${FONTS[font].family}"`)
      const source = new Image()
      source.src = imageUrl
      await source.decode()
      const width = Math.round(crop.width)
      const height = Math.round(crop.height)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('画像の作成に失敗しました。')
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)

      const padding = Math.max(22, Math.round(width * 0.025))
      const fontSize = Math.max(8, Math.round(width * (copyright === 'full' ? 0.018 : 0.025) * (copyrightSize / 100)))
      if (copyright !== 'none') {
        context.font = `${fontSize}px "${FONTS[font].family}"`
        context.fillStyle = '#ffffff'
        context.shadowColor = 'rgba(0, 0, 0, 0.82)'
        context.shadowBlur = Math.max(3, Math.round(fontSize * 0.14))
        context.shadowOffsetX = Math.max(1, Math.round(fontSize * 0.06))
        context.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.06))
        context.textAlign = position.includes('right') ? 'right' : 'left'
        context.textBaseline = position.includes('bottom') ? 'bottom' : 'top'
        context.fillText(COPYRIGHTS[copyright], position.includes('right') ? width - padding : padding, position.includes('bottom') ? height - padding : padding)
      }

      const canvases = outputMode === 'triple'
        ? [0, 1, 2].map(index => {
            const startX = Math.round((width * index) / 3)
            const endX = Math.round((width * (index + 1)) / 3)
            const part = document.createElement('canvas')
            part.width = endX - startX
            part.height = height
            const partContext = part.getContext('2d')
            if (!partContext) throw new Error('分割画像の作成に失敗しました。')
            partContext.drawImage(canvas, startX, 0, part.width, height, 0, 0, part.width, height)
            return part
          })
        : [canvas]
      const blobs = await Promise.all(canvases.map(part => new Promise<Blob>((resolve, reject) => part.toBlob(result => result ? resolve(result) : reject(new Error('PNG の生成に失敗しました。')), 'image/png'))))
      discardOutput()
      setOutputUrls(blobs.map(blob => URL.createObjectURL(blob)))
      setOutputFilePrefix(createOutputFilePrefix())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PNG の生成に失敗しました。')
    } finally {
      setIsGenerating(false)
    }
  }

  const cropStyle = crop && imageSize.width ? {
    left: `${(crop.x / imageSize.width) * 100}%`,
    top: `${(crop.y / imageSize.height) * 100}%`,
    width: `${(crop.width / imageSize.width) * 100}%`,
    height: `${(crop.height / imageSize.height) * 100}%`,
  } : undefined
  const isPortraitImage = imageSize.height > imageSize.width

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">FFXIV SCREENSHOT EDITOR</p>
        <h1>ウルトラワイドを、<em>ちょうどいい</em> 比率へ。</h1>
        <p>画像はどこにも保存されないので安心して下さい。</p>
      </header>

      <section className={`workspace${isPortraitImage ? ' is-portrait' : ''}`} aria-label="スクリーンショット編集">
        <div className="editor-panel">
          <div className="panel-heading"><h2>1. スクリーンショット</h2><span>PNG / JPEG</span></div>
          {!imageUrl ? (
            <label className={`upload-zone${isDraggingFile ? ' is-dragging' : ''}`} onDragEnter={dragOverUpload} onDragOver={dragOverUpload} onDragLeave={() => setIsDraggingFile(false)} onDrop={dropImage}>
              <input type="file" accept="image/png,image/jpeg" onChange={selectImage} />
              <span className="upload-icon">＋</span><strong>{isDraggingFile ? 'ここにドロップ' : '画像を選択'}</strong><small>クリックまたはドラッグ＆ドロップで読み込みます</small>
            </label>
          ) : (
            <>
              <div className="stage-wrap">
                <div className="image-stage" ref={stageRef} style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
                  <img src={imageUrl} onLoad={loadImage} alt="読み込んだスクリーンショット" draggable={false} />
                  {crop && <>
                    <div className="crop-box" style={cropStyle} onPointerDown={(event) => beginDrag(event, 'move')}>
                      <div className="crop-label">{ASPECTS[aspectMode].shortLabel}</div>
                      {outputMode === 'triple' && <><div className="split-guide split-guide-first" /><div className="split-guide split-guide-second" /></>}
                      {(aspectMode === 'portrait' ? PORTRAIT_HANDLES : LANDSCAPE_HANDLES).map(handle => <div key={handle} className={`handle handle-${handle}`} onPointerDown={(event) => beginDrag(event, handle)} />)}
                      {copyright !== 'none' && <div className={`live-copyright ${position} font-${font}`} style={{ '--copyright-scale': copyrightSize / 100 } as React.CSSProperties}>{COPYRIGHTS[copyright]}</div>}
                    </div>
                  </>}
                </div>
              </div>
              <label className="replace-image"><input type="file" accept="image/png,image/jpeg" onChange={selectImage} />別の画像を選択</label>
            </>
          )}
          {error && <p className="error-message" role="alert">{error}</p>}
        </div>

        <aside className="settings-panel">
          <div className="panel-heading"><h2>2. 出力設定</h2><span>プレビューに即時反映</span></div>
          <fieldset disabled={!imageUrl}><legend>切り抜き比率</legend><div className="mode-grid">
            {(Object.entries(ASPECTS) as [AspectMode, typeof ASPECTS[AspectMode]][]).map(([key, item]) => <button type="button" className={aspectMode === key ? 'selected' : ''} onClick={() => changeAspectMode(key)} key={key}>{item.label}</button>)}
          </div></fieldset>
          <fieldset disabled={!imageUrl}><legend>出力モード</legend><div className="mode-grid">
            <button type="button" className={outputMode === 'single' ? 'selected' : ''} onClick={() => changeSetting(setOutputMode, 'single')}>通常（1枚）</button>
            <button type="button" className={outputMode === 'triple' ? 'selected' : ''} onClick={() => changeSetting(setOutputMode, 'triple')}>横3分割（3枚）</button>
          </div></fieldset>
          <fieldset disabled={!imageUrl}><legend>表記</legend>
            {(Object.entries(COPYRIGHTS) as [CopyrightKey, string][]).map(([key, value]) => <label className="choice-card" key={key}><input type="radio" name="copyright" checked={copyright === key} onChange={() => changeSetting(setCopyright, key)} /><span>{key === 'none' ? 'コピーライトなし（非推奨）' : key === 'short' ? '簡易表記' : '標準表記'}</span>{value && <small>{value}</small>}</label>)}
          </fieldset>
          <fieldset disabled={!imageUrl}><legend>表示位置</legend><div className="position-grid">
            {([{ key: 'top-left', label: '左上' }, { key: 'top-right', label: '右上' }, { key: 'bottom-left', label: '左下' }, { key: 'bottom-right', label: '右下' }] as { key: Position; label: string }[]).map(item => <button type="button" key={item.key} className={position === item.key ? 'selected' : ''} onClick={() => changeSetting(setPosition, item.key)}>{item.label}</button>)}
          </div></fieldset>
          <fieldset disabled={!imageUrl}><legend>フォント</legend><select value={font} onChange={(event) => changeSetting(setFont, event.target.value as FontKey)}>{Object.entries(FONTS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></fieldset>
          <fieldset disabled={!imageUrl || copyright === 'none'}><legend>文字サイズ <output>{copyrightSize}%</output></legend><input className="size-slider" type="range" min="40" max="100" step="1" value={copyrightSize} onInput={(event) => changeSetting(setCopyrightSize, event.currentTarget.valueAsNumber)} aria-label="コピーライトの文字サイズ" /></fieldset>
          <button className="generate-button" type="button" disabled={!imageUrl || !crop || outputUrls.length > 0 || isGenerating} onClick={generate}>{isGenerating ? 'PNG を生成中…' : outputUrls.length > 0 ? 'PNG を生成しました' : outputMode === 'triple' ? '3枚の PNG を生成' : 'トリミングして PNG を生成'}</button>
          {outputUrls.length === 1 && <a className="download-button" href={outputUrls[0]} download={`${outputFilePrefix}.png`}>PNG をダウンロード</a>}
          {outputUrls.length === 3 && <div className="download-list">{outputUrls.map((url, index) => <a className="download-button" href={url} download={`${outputFilePrefix}-${index + 1}.png`} key={url}>{index + 1}枚目をダウンロード</a>)}</div>}
        </aside>
      </section>
      {outputUrls.length > 0 && <section className="result"><div className="panel-heading"><h2>生成結果</h2><span>{outputUrls.length === 3 ? `横3分割・${ASPECTS[aspectMode].shortLabel}・元解像度・PNG` : `${ASPECTS[aspectMode].shortLabel}・元解像度・PNG`}</span></div><div className={`result-images ${outputUrls.length === 3 ? 'is-triple' : ''}`}>{outputUrls.map((url, index) => <figure key={url}><img src={url} alt={outputUrls.length === 3 ? `生成した分割画像 ${index + 1}枚目` : `生成した${ASPECTS[aspectMode].shortLabel}の画像`} />{outputUrls.length === 3 && <figcaption>{index + 1}枚目</figcaption>}</figure>)}</div></section>}
    </main>
  )
}

export default App
