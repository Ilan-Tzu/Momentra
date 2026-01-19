import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';

describe('App', () => {
    it('renders without crashing', () => {
        render(
            <GoogleOAuthProvider clientId="test-client-id">
                <App />
            </GoogleOAuthProvider>
        );
        // Basic check for something we know is in the app, like the calendar strip or login
        // Since we mock API and context, just checking render is a good first step.
    });
});
