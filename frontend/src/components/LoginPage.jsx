import { useState, useEffect, useRef } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { jobService } from '../services/api'
import { setTokens } from '../utils/auth'
import './LoginPage.css'

function LoginPage({ onLogin }) {
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    // Refs for animation engine
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const blocksRef = useRef([])
    const requestRef = useRef()

    const NUM_BLOCKS = 10
    const VELOCITY = 0.2
    const LINK_DISTANCE = 380

    // Initialize blocks with random positions and velocities
    useEffect(() => {
        const w = window.innerWidth
        const h = window.innerHeight
        const blocks = Array.from({ length: NUM_BLOCKS }).map((_, i) => {
            const blockX = Math.random() * (w - 120)
            const blockY = Math.random() * (h - 120)

            const getVel = () => {
                const v = (Math.random() - 0.5) * 2 * VELOCITY
                return Math.abs(v) < 0.1 ? (v > 0 ? 0.1 : -0.1) : v
            }

            return {
                id: i + 1,
                x: blockX,
                y: blockY,
                vx: getVel(),
                vy: getVel(),
                width: 100,
                height: 100,
                radius: 50,
            }
        })
        blocksRef.current = blocks

        blocks.forEach(block => {
            const el = document.getElementById(`block-${block.id}`)
            if (el) el.style.transform = `translate(${block.x}px, ${block.y}px)`
        })

        const resolveCollision = (b1, b2) => {
            const dx = (b1.x + b1.radius) - (b2.x + b2.radius)
            const dy = (b1.y + b1.radius) - (b2.y + b2.radius)
            const distance = Math.sqrt(dx * dx + dy * dy)
            const minDistance = b1.radius + b2.radius

            if (distance < minDistance) {
                const nx = dx / distance
                const ny = dy / distance
                const rvx = b1.vx - b2.vx
                const rvy = b1.vy - b2.vy
                const velAlongNormal = rvx * nx + rvy * ny

                if (velAlongNormal > 0) return

                const impulse = 2 * velAlongNormal
                b1.vx -= (impulse / 2) * nx
                b1.vy -= (impulse / 2) * ny
                b2.vx += (impulse / 2) * nx
                b2.vy += (impulse / 2) * ny

                const overlap = minDistance - distance
                b1.x += (overlap / 2) * nx
                b1.y += (overlap / 2) * ny
                b2.x -= (overlap / 2) * nx
                b2.y -= (overlap / 2) * ny
            }
        }

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
                ctx.fillStyle = '#0F0518'
                ctx.fillRect(0, 0, width, height)
            }

            // Create TRACE EFFECT by filling with semi-transparent background
            ctx.fillStyle = 'rgba(15, 5, 24, 0.15)'
            ctx.fillRect(0, 0, width, height)

            // Update positions
            blocksRef.current.forEach(block => {
                block.x += block.vx
                block.y += block.vy

                // Boundary collision logic with hard clamping
                if (block.x <= 0) {
                    block.x = 0; block.vx = Math.abs(block.vx)
                } else if (block.x + block.width >= width) {
                    block.x = width - block.width; block.vx = -Math.abs(block.vx)
                }

                if (block.y <= 0) {
                    block.y = 0; block.vy = Math.abs(block.vy)
                } else if (block.y + block.height >= height) {
                    block.y = height - block.height; block.vy = -Math.abs(block.vy)
                }
            })

            // Resolve block-to-block collisions
            for (let i = 0; i < blocksRef.current.length; i++) {
                for (let j = i + 1; j < blocksRef.current.length; j++) {
                    resolveCollision(blocksRef.current[i], blocksRef.current[j])
                }
            }

            // Sync DOM elements and Draw Trace Heads
            blocksRef.current.forEach(block => {
                const el = document.getElementById(`block-${block.id}`)
                if (el) el.style.transform = `translate(${block.x}px, ${block.y}px)`

                // Draw a small glowing particle on canvas for the trace
                const centerX = block.x + block.radius
                const centerY = block.y + block.radius
                const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 20)
                gradient.addColorStop(0, 'rgba(176, 0, 255, 0.3)')
                gradient.addColorStop(1, 'transparent')
                ctx.fillStyle = gradient
                ctx.fillRect(centerX - 20, centerY - 20, 40, 40)
            })

            // Draw Neural Net Links
            for (let i = 0; i < blocksRef.current.length; i++) {
                for (let j = i + 1; j < blocksRef.current.length; j++) {
                    const b1 = blocksRef.current[i]
                    const b2 = blocksRef.current[j]
                    const dx = (b1.x + b1.radius) - (b2.x + b2.radius)
                    const dy = (b1.y + b1.radius) - (b2.y + b2.radius)
                    const dist = Math.sqrt(dx * dx + dy * dy)

                    if (dist < LINK_DISTANCE) {
                        const ratio = 1 - dist / LINK_DISTANCE
                        const opacity = Math.pow(ratio, 2.5) * 0.5
                        ctx.beginPath()
                        ctx.strokeStyle = `rgba(176, 0, 255, ${opacity})`
                        ctx.lineWidth = ratio * 2
                        ctx.moveTo(b1.x + b1.radius, b1.y + b1.radius)
                        ctx.lineTo(b2.x + b2.radius, b2.y + b2.radius)
                        ctx.stroke()

                        if (dist < LINK_DISTANCE * 0.4) {
                            const glowOpacity = Math.pow(1 - dist / (LINK_DISTANCE * 0.4), 2) * 0.3
                            ctx.beginPath()
                            ctx.strokeStyle = `rgba(255, 0, 207, ${glowOpacity})`
                            ctx.lineWidth = ratio * 4
                            ctx.moveTo(b1.x + b1.radius, b1.y + b1.radius)
                            ctx.lineTo(b2.x + b2.radius, b2.y + b2.radius)
                            ctx.stroke()
                        }
                    }
                }
            }

            requestRef.current = requestAnimationFrame(animate)
        }

        requestRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(requestRef.current)
    }, [])

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
        <div className="login-container" ref={containerRef}>
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 0
                }}
            />
            <style>
                {`
                .floating-block {
                    position: absolute;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    border-radius: 20px;
                    background: rgba(176, 0, 255, 0.08) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    backdrop-filter: blur(12px);
                    opacity: 0.5 !important;
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2) !important;
                    z-index: 1;
                    width: 100px !important;
                    height: 100px !important;
                    left: 0;
                    top: 0;
                    will-change: transform;
                }

                @keyframes breathe {
                    0% { transform: scale(0.9) rotate(0deg); }
                    100% { transform: scale(1.1) rotate(5deg); }
                }
                `}
            </style>

            {/* Floating Calendar Blocks Background */}
            <div className="floating-blocks">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => (
                    <div key={id} id={`block-${id}`} className="floating-block">
                        <div style={{
                            animation: `breathe ${7 + Math.random() * 5}s ease-in-out infinite alternate`,
                            animationDelay: `${-Math.random() * 10}s`,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}>
                            <span className="block-day">{['Mon', 'Wed', 'Fri', 'Sun', 'Tue', 'Thu', 'Sat', 'Mon', 'Tue', 'Wed'][id - 1]}</span>
                            <span className="block-num">{[15, 23, 8, 31, 12, 4, 19, 26, 7, 14][id - 1]}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="login-card">
                <h1>Welcome to Momentra</h1>
                <p>Sign in to manage your calendar</p>

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
