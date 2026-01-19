import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { jobService } from '../services/api'
import './LoginPage.css'

function LoginPage({ onLogin }) {
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleGoogleSuccess = async (credentialResponse) => {
        setError('')
        setIsLoading(true)

        try {
            const userData = await jobService.googleLogin(credentialResponse.credential)
            localStorage.setItem('momentra_user', userData.email || userData.username)
            onLogin(userData.email || userData.username)
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
        <div className="login-container">
            {/* Floating Calendar Blocks Background */}
            <div className="floating-blocks">
                <div className="floating-block block-1">
                    <span className="block-day">Mon</span>
                    <span className="block-num">15</span>
                </div>
                <div className="floating-block block-2">
                    <span className="block-day">Wed</span>
                    <span className="block-num">23</span>
                </div>
                <div className="floating-block block-3">
                    <span className="block-day">Fri</span>
                    <span className="block-num">8</span>
                </div>
                <div className="floating-block block-4">
                    <span className="block-day">Sun</span>
                    <span className="block-num">31</span>
                </div>
                <div className="floating-block block-5">
                    <span className="block-day">Tue</span>
                    <span className="block-num">12</span>
                </div>
                <div className="floating-block block-6">
                    <span className="block-day">Thu</span>
                    <span className="block-num">4</span>
                </div>
                <div className="floating-block block-7">
                    <span className="block-day">Sat</span>
                    <span className="block-num">19</span>
                </div>
                <div className="floating-block block-8">
                    <span className="block-day">Mon</span>
                    <span className="block-num">26</span>
                </div>
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
        </div>
    )
}

export default LoginPage
