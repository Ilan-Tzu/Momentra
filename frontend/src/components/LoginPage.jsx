import { useState, useEffect, useRef } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { jobService } from '../services/api'
import { setTokens } from '../utils/auth'
import './LoginPage.css'

function LoginPage({ onLogin }) {
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    // State for Feature Ticker
    const [featureIndex, setFeatureIndex] = useState(0)
    const features = [
        "Smart Conflict Resolution",
        "AI-Powered Multiple Event Parsing",
        "Seamless Calendar Integration",
        "Write it quickly, get it done with quality",
        "Speak your schedule into existence",
        "Quick Template Actions"
    ]

    useEffect(() => {
        const interval = setInterval(() => {
            setFeatureIndex((prev) => (prev + 1) % features.length)
        }, 3500) // Slightly slower rotation
        return () => clearInterval(interval)
    }, [])

    // Refs for animation engine
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const cardRef = useRef(null)
    const blocksRef = useRef([])
    const requestRef = useRef()
    const mouseRef = useRef({ x: -1000, y: -1000 })

    const NUM_BLOCKS = 15
    const VELOCITY = 0.05 // Even slower from 0.12
    const LINK_DISTANCE = 300
    const REPULSION_RADIUS = 250 // Slightly larger area

    // State for initial blocks to avoid sudden appearance after mount
    const [blocks, setBlocks] = useState(() => {
        // Initial setup with placeholder positions until useEffect runs
        return Array.from({ length: 15 }).map((_, i) => ({
            id: i + 1,
            x: -200, // Off screen briefly
            y: -200,
            vx: 0,
            vy: 0,
            width: 100,
            height: 100,
            radius: 50,
        }))
    })

    // Initialize blocks with real positions and consistent drift directions
    useEffect(() => {
        const w = window.innerWidth
        const h = window.innerHeight

        // Give each block a consistent, slow drift direction
        const initializedBlocks = blocks.map((block, i) => {
            const angle = (i / blocks.length) * Math.PI * 2 // Spread directions evenly
            return {
                ...block,
                x: Math.random() * w,
                y: Math.random() * h,
                // Consistent directional drift
                vx: Math.cos(angle) * VELOCITY,
                vy: Math.sin(angle) * VELOCITY,
                // Phase offset for sinusoidal wobble
                phase: Math.random() * Math.PI * 2,
            }
        })
        setBlocks(initializedBlocks)
        blocksRef.current = initializedBlocks

        let time = 0

        const animate = () => {
            const canvas = canvasRef.current
            if (!canvas) return
            const ctx = canvas.getContext('2d')
            const container = containerRef.current
            if (!container) return

            const { clientWidth: width, clientHeight: height } = container
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width
                canvas.height = height
            }

            ctx.clearRect(0, 0, width, height)
            time += 0.01

            // Update positions with smooth, ambient motion
            blocksRef.current.forEach(block => {
                // Gentle sinusoidal wobble for organic feel
                const wobbleX = Math.sin(time + block.phase) * 0.02
                const wobbleY = Math.cos(time * 0.7 + block.phase) * 0.02

                // Very subtle mouse influence - blocks drift slightly away
                const dx = block.x + block.radius - mouseRef.current.x
                const dy = block.y + block.radius - mouseRef.current.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                let mouseInfluenceX = 0
                let mouseInfluenceY = 0
                if (dist < REPULSION_RADIUS && dist > 0) {
                    const force = Math.pow((REPULSION_RADIUS - dist) / REPULSION_RADIUS, 2) * 0.003
                    mouseInfluenceX = (dx / dist) * force
                    mouseInfluenceY = (dy / dist) * force
                }

                // Apply smooth movement
                block.x += block.vx + wobbleX + mouseInfluenceX
                block.y += block.vy + wobbleY + mouseInfluenceY

                // Seamless wrap around screen edges
                if (block.x < -block.width) block.x = width + 10
                if (block.x > width + block.width) block.x = -10
                if (block.y < -block.height) block.y = height + 10
                if (block.y > height + block.height) block.y = -10
            })

            // Sync DOM elements with smooth transform
            blocksRef.current.forEach(block => {
                const el = document.getElementById(`block-${block.id}`)
                if (el) {
                    el.style.transform = `translate(${block.x.toFixed(2)}px, ${block.y.toFixed(2)}px)`
                }

                // Draw soft glow on canvas around each block
                const centerX = block.x + block.radius
                const centerY = block.y + block.radius
                const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 120)
                glowGradient.addColorStop(0, 'rgba(139, 92, 246, 0.08)')
                glowGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.03)')
                glowGradient.addColorStop(1, 'transparent')
                ctx.fillStyle = glowGradient
                ctx.fillRect(centerX - 120, centerY - 120, 240, 240)
            })

            // Draw subtle connection lines between nearby blocks
            for (let i = 0; i < blocksRef.current.length; i++) {
                for (let j = i + 1; j < blocksRef.current.length; j++) {
                    const b1 = blocksRef.current[i]
                    const b2 = blocksRef.current[j]
                    const dx = (b1.x + b1.radius) - (b2.x + b2.radius)
                    const dy = (b1.y + b1.radius) - (b2.y + b2.radius)
                    const dist = Math.sqrt(dx * dx + dy * dy)

                    if (dist < LINK_DISTANCE) {
                        const ratio = 1 - dist / LINK_DISTANCE
                        // Very subtle lines - truly background
                        const opacity = Math.pow(ratio, 2) * 0.08
                        ctx.beginPath()
                        ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`
                        ctx.lineWidth = 1
                        ctx.moveTo(b1.x + b1.radius, b1.y + b1.radius)
                        ctx.lineTo(b2.x + b2.radius, b2.y + b2.radius)
                        ctx.stroke()
                    }
                }
            }

            requestRef.current = requestAnimationFrame(animate)
        }

        requestRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(requestRef.current)
    }, [])

    const handleMouseMove = (e) => {
        if (!containerRef.current || !cardRef.current) return

        const { clientX, clientY } = e
        mouseRef.current = { x: clientX, y: clientY }

        // Card Spotlight & Tilt
        const rect = cardRef.current.getBoundingClientRect()
        const x = clientX - rect.left
        const y = clientY - rect.top

        cardRef.current.style.setProperty('--mouse-x', `${x}px`)
        cardRef.current.style.setProperty('--mouse-y', `${y}px`)

        // 3D Tilt Effect
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        const rotateX = ((clientY - centerY) / (window.innerHeight / 2)) * -5 // Max 5deg tilt
        const rotateY = ((clientX - centerX) / (window.innerWidth / 2)) * 5

        cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
    }
    const handleGoogleSuccess = async (credentialResponse) => {
        setError('')
        setIsLoading(true)

        try {
            const response = await jobService.googleLogin(credentialResponse.credential)

            // Response now contains: { access_token, refresh_token, user: {id, username} }
            setTokens(response.access_token, response.refresh_token, response.user)

            // Call the onLogin callback with username
            onLogin(response.user.username)
        } catch (err) {
            console.error('Google login failed:', err)
            setError('Google login failed. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoogleError = () => {
        setError('Google Sign-In was unsuccessful. Please try again.')
    }

    return (
        <div
            className="login-container"
            ref={containerRef}
            onMouseMove={handleMouseMove}
        >
            <canvas ref={canvasRef} />

            {/* Floating Calendar Blocks Background */}
            <div className="floating-blocks">
                {blocks.map((block, idx) => (
                    <div
                        key={block.id}
                        id={`block-${block.id}`}
                        className="floating-block"
                        style={{
                            animationDelay: `${idx * 0.1}s`,
                            opacity: 0 // Start hidden for fade-in
                        }}
                    >
                        <div style={{
                            animation: `breathe ${7 + Math.random() * 5}s ease-in-out infinite alternate`,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}>
                            <span className="block-day">{['Mon', 'Wed', 'Fri', 'Sun', 'Tue'][block.id % 5]}</span>
                            <span className="block-num">{Math.floor(Math.random() * 30) + 1}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="login-card" ref={cardRef}>
                <h1>Welcome to Momentra</h1>

                {/* Feature Ticker */}
                <div style={{ height: '24px', overflow: 'hidden', position: 'relative' }}>
                    {features.map((text, i) => (
                        <p
                            key={i}
                            style={{
                                position: 'absolute',
                                width: '100%',
                                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                                opacity: i === featureIndex ? 1 : 0,
                                transform: `translateY(${i === featureIndex ? 0 : 20}px)`,
                                margin: 0
                            }}
                        >
                            {text}
                        </p>
                    ))}
                </div>

                <div className="google-login-wrapper">
                    {isLoading ? (
                        <p className="loading-text">Signing in...</p>
                    ) : (
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={handleGoogleError}
                            theme="filled_black"
                            size="large"
                            shape="pill"
                            text="signin_with"
                            logo_alignment="left"
                        />
                    )}
                </div>

                {error && <p className="error-msg">{error}</p>}
            </div>
        </div >
    )
}

export default LoginPage
