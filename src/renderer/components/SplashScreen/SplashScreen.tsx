import { useEffect, useRef } from 'react'

interface SplashScreenProps {
  onComplete: () => void
  speed?: 'standard' | 'fast'
}

export function SplashScreen({ onComplete, speed = 'standard' }: SplashScreenProps): JSX.Element {
  const splashRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const splash = splashRef.current
    const titleEl = titleRef.current
    const subtitleEl = subtitleRef.current
    if (!splash || !titleEl || !subtitleEl) return

    if (speed === 'fast') {
      // 快速模式：全部文本立即显示，1 秒后淡出完成
      titleEl.innerHTML = 'UDSEEN'
      subtitleEl.style.opacity = '1'
      titleEl.style.opacity = '1'
      const timer = setTimeout(() => {
        titleEl.style.transition = 'opacity .3s ease'
        titleEl.style.opacity = '0'
        subtitleEl.style.transition = 'opacity .3s ease'
        subtitleEl.style.opacity = '0'
        setTimeout(() => {
          splash.style.transition = 'opacity .4s ease'
          splash.style.opacity = '0'
          setTimeout(() => {
            onComplete()
          }, 400)
        }, 300)
      }, 1000)
      return () => clearTimeout(timer)
    }

    // 标准模式：逐字动画

    // Build character spans
    const title = 'UDSEEN'
    const charInterval = 180
    titleEl.innerHTML = ''
    title.split('').forEach((char, i) => {
      const span = document.createElement('span')
      span.textContent = char
      span.className = 'splash-char'
      span.style.animationDelay = `${i * charInterval}ms`
      titleEl.appendChild(span)
    })

    // Subtitle: fade in after last char starts appearing
    const subtitleDelay = (title.length - 1) * charInterval + 400
    const subtitleTimer = setTimeout(() => {
      subtitleEl.style.opacity = '1'
    }, subtitleDelay)

    // Fade-out sequence: total ~4s
    const displayTime = 3000
    const timer = setTimeout(() => {
      titleEl.style.transition = 'opacity .3s ease'
      titleEl.style.opacity = '0'
      subtitleEl.style.transition = 'opacity .3s ease'
      subtitleEl.style.opacity = '0'
      setTimeout(() => {
        splash.style.transition = 'opacity .7s ease'
        splash.style.opacity = '0'
        setTimeout(() => {
          onComplete()
        }, 700)
      }, 300)
    }, displayTime)

    return () => {
      clearTimeout(timer)
      clearTimeout(subtitleTimer)
    }
  }, [onComplete, speed])

  return (
    <div
      ref={splashRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'splashColorShift 2s ease forwards'
      }}
    >
      <div
        ref={titleRef}
        style={{
          fontSize: 56,
          letterSpacing: 6,
          fontWeight: 300,
          lineHeight: 1.2
        }}
      />
      <div
        ref={subtitleRef}
        style={{
          fontSize: 13,
          letterSpacing: 3,
          opacity: 0,
          marginTop: 16,
          transition: 'opacity .6s linear'
        }}
      >
        Momster Tech
      </div>
      <style>{`
        .splash-char {
          display: inline-block;
          will-change: transform, opacity;
          animation: splashCharIn .6s cubic-bezier(.08,.82,.3,1) both;
          animation-delay: 0s;
        }
        @keyframes splashCharIn {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashColorShift {
          0% { background: #ffffff; color: #000000; }
          100% { background: #000000; color: #ffffff; }
        }
      `}</style>
    </div>
  )
}
