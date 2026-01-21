# Momentra Stress Test Prompts

Use these prompts to test the core logic of the Momentra Calendar, including conflict resolution, multiday scheduling, and deep entity extraction.

---

## 1. Conflict & Ambiguity Testing
*Tests how the system handles overlaps and ambiguity options in the UI.*

| Prompt | Expected Result | Expected Behavior |
| :--- | :--- | :--- |
| "Schedule a lunch with Sarah from 12 PM to 1:30 PM today, and also add a sync with the marketing team from 1 PM." | **Two events.** | The "Sync" event should be marked as **Ambiguity** or show a **Conflict Message** saying it overlaps with "Lunch with Sarah". |
| "Moving my 2 PM meeting today to 3 PM." *(Assuming a 3 PM meeting already exists)* | **One update candidate.** | The card should enter the **Ambiguity state**, showing options like "Keep Both", "Replace Existing", or "Discard". |
| "I have a flight landing at 4 PM tomorrow. Schedule a meeting in the city at 4:30 PM tomorrow." | **Two separate events.** | Both should render. Tests close-proximity scheduling without technical overlap. |

---

## 2. Multiday & Relative Timing
*Tests date resolution across sequences and recurring logic.*

| Prompt | Expected Result | Key Extraction |
| :--- | :--- | :--- |
| "I'm going to a conference in San Francisco from Wednesday to Friday. On Thursday evening during the trip, schedule a dinner at 'The House' at 7 PM." | 1. **Conference** (Wed-Fri)<br>2. **Dinner** (Thu 7 PM) | Verify "Thursday" resolve to the date *inside* the conference range. |
| "For the next 4 days, I want to spend the first hour of my day (starting at 8 AM) doing deep work." | **4 separate event cards.** | Verify that 4 unique dates are generated in the preview window. |
| "I have a big presentation next Monday at 9 AM. Create a 2-hour study session for it this Friday afternoon and a 30-minute 'final review' on Sunday night at 8 PM." | **3 events.** | Verify "This Friday" and "Next Monday" resolve to the correct, distinct dates. |

---

## 3. Deep Description & Metadata Extraction
*Tests the LLM's ability to extract notes, locations, and durations.*

| Prompt | Expected Result | Extracted Metadata |
| :--- | :--- | :--- |
| "Remind me to go to Whole Foods on Friday at 5 PM. I need to pick up: organic kale, almond milk, and batteries for the remote. Put all these in the notes." | **Title:** "Go to Whole Foods"<br>**Time:** Fri 5 PM | **Notes:** "pick up: organic kale, almond milk, and batteries for the remote." |
| "Add a meeting: 'New Website Launch'. It's tomorrow at 10 AM for 90 minutes. We'll be in Conference Room B. We need to discuss the hero section and API integration." | **Title:** "Website Launch"<br>**Time:** 10:00 - 11:30 AM | **Location:** "Conference Room B"<br>**Notes:** "Discuss hero section and API integration." |
| "I need to call my landlord about the sink leak. Do it on Tuesday during my lunch break. Mention that it's been leaking for three days." | **Title:** "Call Landlord"<br>**Time:** Tue (~12:00 PM) | **Notes:** "About sink leak; leaking for three days." |

---

## 💡 How to verify results in the UI
1. **Title:** Ensure the `<h3>` shows the correct intent.
2. **Details (📅 icon):** Ensure the date resolves to a real date in the future.
3. **Details (🕒 icon):** Ensure durations (e.g., "90 minutes") are calculated correctly.
4. **Action Buttons:** Verify that **Reject**, **Edit**, and **Accept** are visible on every card.
5. **Ambiguity:** Verify that conflict-specific buttons (labels like "Keep Both" or "Replace") appear when a conflict is triggered.
