import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

const ASPECT = 16 / 9
const COPYRIGHTS = {
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
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Crop = { x: number; y: number; width: number; height: number }
type Drag = { handle: Handle; startX: number; startY: number; crop: Crop } | null

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function initialCrop(width: number, height: number): Crop {
  const cropWidth = Math.min(width, height * ASPECT)
  const cropHeight = cropWidth / ASPECT
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight }
}

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [crop, setCrop] = useState<Crop | null>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const [copyright, setCopyright] = useState<CopyrightKey>('short')
  const [position, setPosition] = useState<Position>('bottom-right')
  const [font, setFont] = useState<FontKey>('greatVibes')
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>(null)

  useEffect(() => { dragRef.current = drag }, [drag])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl) }, [outputUrl])

  const discardOutput = () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl)
    setOutputUrl(null)
  }

  const updateCrop = (next: Crop) => {
    discardOutput()
    setCrop(next)
  }

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
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
    event.target.value = ''
  }

  const loadImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    if (!width || !height) return
    setImageSize({ width, height })
    setCrop(initialCrop(width, height))
  }

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, handle: Handle) => {
    if (!crop || !stageRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ handle, startX: event.clientX, startY: event.clientY, crop })
  }

  const resizeCrop = (start: Crop, handle: Exclude<Handle, 'move'>, dx: number, dy: number): Crop => {
    const minWidth = Math.min(180, imageSize.width, imageSize.height * ASPECT)
    const left = handle.includes('w')
    const right = handle.includes('e')
    const top = handle.includes('n')
    const bottom = handle.includes('s')
    let width = start.width
    let x = start.x
    let y = start.y

    if (left || right) {
      const horizontalDelta = (right ? 1 : -1) * dx
      const verticalDelta = (top ? -1 : 1) * dy * ASPECT
      const delta = top || bottom
        ? (Math.abs(horizontalDelta) > Math.abs(verticalDelta) ? horizontalDelta : verticalDelta)
        : horizontalDelta
      width = start.width + delta
    } else {
      width = start.width + (bottom ? dy : -dy) * ASPECT
    }

    const anchorX = left ? start.x + start.width : start.x
    const anchorY = top ? start.y + start.height : start.y
    const maxWidth = left
      ? anchorX
      : right
        ? imageSize.width - anchorX
        : imageSize.width
    width = clamp(width, minWidth, Math.min(maxWidth, imageSize.height * ASPECT))
    const height = width / ASPECT

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
      const fontSize = Math.max(19, Math.round(width * (copyright === 'full' ? 0.025 : 0.035)))
      context.font = `${fontSize}px "${FONTS[font].family}"`
      context.fillStyle = '#ffffff'
      context.shadowColor = 'rgba(0, 0, 0, 0.82)'
      context.shadowBlur = Math.max(3, Math.round(fontSize * 0.14))
      context.shadowOffsetX = Math.max(1, Math.round(fontSize * 0.06))
      context.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.06))
      context.textAlign = position.includes('right') ? 'right' : 'left'
      context.textBaseline = position.includes('bottom') ? 'bottom' : 'top'
      context.fillText(COPYRIGHTS[copyright], position.includes('right') ? width - padding : padding, position.includes('bottom') ? height - padding : padding)

      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG の生成に失敗しました。')), 'image/png'))
      discardOutput()
      setOutputUrl(URL.createObjectURL(blob))
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

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">FFXIV SCREENSHOT EDITOR</p>
        <h1>ウルトラワイドを、<em>ちょうどいい</em> 16:9へ。</h1>
        <p>画像はあなたのブラウザ内だけで処理されます。外部へアップロードされることはありません。</p>
      </header>

      <section className="workspace" aria-label="スクリーンショット編集">
        <div className="editor-panel">
          <div className="panel-heading"><h2>1. スクリーンショット</h2><span>PNG / JPEG</span></div>
          {!imageUrl ? (
            <label className="upload-zone">
              <input type="file" accept="image/png,image/jpeg" onChange={selectImage} />
              <span className="upload-icon">＋</span><strong>画像を選択</strong><small>FF14で撮影したスクリーンショットをここから読み込みます</small>
            </label>
          ) : (
            <>
              <div className="stage-wrap">
                <div className="image-stage" ref={stageRef} style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
                  <img src={imageUrl} onLoad={loadImage} alt="読み込んだスクリーンショット" draggable={false} />
                  {crop && <>
                    <div className="crop-box" style={cropStyle} onPointerDown={(event) => beginDrag(event, 'move')}>
                      <div className="crop-label">16:9</div>
                      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map(handle => <div key={handle} className={`handle handle-${handle}`} onPointerDown={(event) => beginDrag(event, handle)} />)}
                      <div className={`live-copyright ${position} font-${font}`}>{COPYRIGHTS[copyright]}</div>
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
          <div className="panel-heading"><h2>2. コピーライト</h2><span>プレビューに即時反映</span></div>
          <fieldset disabled={!imageUrl}><legend>表記</legend>
            {(Object.entries(COPYRIGHTS) as [CopyrightKey, string][]).map(([key, value]) => <label className="choice-card" key={key}><input type="radio" name="copyright" checked={copyright === key} onChange={() => changeSetting(setCopyright, key)} /><span>{key === 'short' ? '簡易表記' : '標準表記'}</span><small>{value}</small></label>)}
          </fieldset>
          <fieldset disabled={!imageUrl}><legend>表示位置</legend><div className="position-grid">
            {([{ key: 'top-left', label: '左上' }, { key: 'top-right', label: '右上' }, { key: 'bottom-left', label: '左下' }, { key: 'bottom-right', label: '右下' }] as { key: Position; label: string }[]).map(item => <button type="button" key={item.key} className={position === item.key ? 'selected' : ''} onClick={() => changeSetting(setPosition, item.key)}>{item.label}</button>)}
          </div></fieldset>
          <fieldset disabled={!imageUrl}><legend>フォント</legend><select value={font} onChange={(event) => changeSetting(setFont, event.target.value as FontKey)}>{Object.entries(FONTS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></fieldset>
          <button className="generate-button" type="button" disabled={!imageUrl || !crop || Boolean(outputUrl) || isGenerating} onClick={generate}>{isGenerating ? 'PNG を生成中…' : outputUrl ? 'PNG を生成しました' : 'トリミングして PNG を生成'}</button>
          {outputUrl && <a className="download-button" href={outputUrl} download="ff14-screenshot-16x9.png">PNG をダウンロード</a>}
        </aside>
      </section>
      {outputUrl && <section className="result"><div className="panel-heading"><h2>生成結果</h2><span>元解像度・PNG</span></div><img src={outputUrl} alt="生成した16対9の画像" /></section>}
    </main>
  )
}

export default App
