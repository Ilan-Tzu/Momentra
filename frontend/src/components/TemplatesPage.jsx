import React from 'react';
import './TemplatesPage.css';

const STOCK_TEMPLATES = [
    {
        id: 'morning',
        icon: '☀️',
        title: 'Productive Morning',
        description: 'A structured start to your day focusing on wellness and focus.',
        text: 'Wake up at 7am, Morning workout for 45 minutes, Breakfast at 8:30am, Start focused work at 9:30am.'
    },
    {
        id: 'workout',
        icon: '💪',
        title: 'Full Fitness Day',
        description: 'Balance your work with multiple activity sessions.',
        text: 'Gym at 8am, Protein shake at 10am, Yoga session at 5pm, Evening walk at 8pm.'
    },
    {
        id: 'mealprep',
        icon: '🍳',
        title: 'Meal Prep Sunday',
        description: 'Establish your weekly nutrition in one focused block.',
        text: 'Grocery shopping at 10am, Meal prep for 3 hours starting at 1pm, Clean kitchen at 4pm.'
    },
    {
        id: 'winddown',
        icon: '🌙',
        title: 'Evening Wind-down',
        description: 'Transition from a busy day to deep, restful sleep.',
        text: 'Dinner at 7pm, Digital detox starting at 9pm, Reading time at 10pm, Sleep by 11pm.'
    },
    {
        id: 'focus',
        icon: '🧠',
        title: 'Deep Work Block',
        description: 'Eliminate distractions with scheduled focus and breaks.',
        text: 'Deep work session from 9am to 12pm, Lunch at 12:30pm, Focus session 2 from 2pm to 4pm.'
    },
    {
        id: 'errands',
        icon: '🚗',
        title: 'Errand Runner',
        description: 'Batch your outside tasks for maximum efficiency.',
        text: 'Drop off dry cleaning at 9am, Post office at 10:30am, Grocery store at 11am, Hardware store at 12pm.'
    }
];

const TemplatesPage = ({ onSelectTemplate }) => {
    return (
        <div className="templates-container">
            <header className="templates-header">
                <h1>Stock Templates</h1>
                <p>Ready-to-use scheduling patterns for your typical routine.</p>
            </header>

            <div className="templates-grid">
                {STOCK_TEMPLATES.map((template) => (
                    <div key={template.id} className="template-card">
                        <div className="template-content">
                            <span className="template-icon">{template.icon}</span>
                            <h3>{template.title}</h3>
                            <p>{template.description}</p>
                        </div>
                        <div className="template-preview">
                            "{template.text}"
                        </div>
                        <button
                            className="use-template-btn"
                            onClick={() => onSelectTemplate(template.text)}
                        >
                            Use Template ✨
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TemplatesPage;
