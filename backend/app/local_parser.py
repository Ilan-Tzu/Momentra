import re
from datetime import datetime, timedelta, timezone
import dateutil.parser

def parse_simple_task(text: str, user_local_time: str = None) -> dict:
    """
    Significantly expanded local parser for deterministic commands.
    Returns None if the input requires NLP/Nuance.
    """
    original_text = text
    text = text.lower().strip()
    
    # 0. Resolve base date (User Local Time)
    base_date = datetime.now()
    if user_local_time:
        try:
            base_date = dateutil.parser.isoparse(user_local_time)
        except: pass

    # 1. PRE-CHECK: Is this a clear scheduling intent?
    # We look for: 'at 5', '5pm', '18:00', '8am', 'tomorrow', 'friday'
    if not re.search(r'(at\s\d|\d\s?am|\d\s?pm|\d:\d|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)', text):
        return None

    try:
        # 2. Extract Date Component
        target_date = base_date
        # Support "this Friday", "next Friday", "coming Friday"
        days_regex = r'(monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
        modifiers = r'(this|next|coming|on)'
        date_pattern = rf'(tomorrow|today|(?:{modifiers}\s)?{days_regex}|on\s([a-z]{{3,}}\s\d{{1,2}}))'
        date_match = re.search(date_pattern, text)
        
        if date_match:
            match_str = date_match.group(0)
            if "tomorrow" in match_str:
                target_date = base_date + timedelta(days=1)
            elif "today" in match_str:
                target_date = base_date
            else:
                days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                # Clean day_str for parsing/indexing (remove modifiers)
                day_str = match_str
                for m in ["this ", "next ", "on ", "coming "]:
                    day_str = day_str.replace(m, "")
                day_str = day_str.strip()
                
                if day_str in days:
                    current_day = base_date.weekday()
                    target_day = days.index(day_str)
                    days_ahead = target_day - current_day
                    if days_ahead <= 0: days_ahead += 7
                    
                    # If user said "next [day]", add another week
                    if "next" in match_str:
                        days_ahead += 7
                        
                    target_date = base_date + timedelta(days=days_ahead)
                else:
                    # Try parsing as specific date e.g. "Feb 20"
                    # We still have "on " maybe
                    try:
                        clean_day = match_str.replace("on ", "").strip()
                        temp_date = dateutil.parser.parse(clean_day)
                        target_date = datetime.combine(temp_date.date(), base_date.time())
                        if base_date.tzinfo: target_date = target_date.replace(tzinfo=base_date.tzinfo)
                        if target_date < base_date - timedelta(days=1):
                            target_date = target_date.replace(year=target_date.year + 1)
                    except: pass
            # Clean text for title extraction later
            text = text.replace(match_str, "").strip()

        # 3. Extract Time Range or Single Time
        # Patterns: "at 5pm", "5pm to 6pm", "17:00-18:00", "5-6pm", "8am"
        # We look for ranges first, then lone times with 'at', then just lone times if they have am/pm or colon
        time_pattern = r'(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)\s?(?:to|at|-|until|—)\s?(\d{1,2}(?::\d{2})?\s?(?:am|pm))|at\s(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)|(\d{1,2}(?::\d{2})?\s?(?:am|pm))'
        time_match = re.search(time_pattern, text)
        if not time_match:
            return None # No clear time found
            
        start_str = time_match.group(1) or time_match.group(3) or time_match.group(4)
        end_str = time_match.group(2)

        # 4. PRE-CLEAN TITLE (Needed for both paths)
        # Remove the time match (use regex for whole-word to be safe)
        temp_title = re.sub(re.escape(time_match.group(0)), ' ', text, flags=re.IGNORECASE).strip()
        
        # Strip common leading/trailing prepositions and junk
        # Including modifiers like 'this' or 'next' if they were left at the end
        noise_words = r'(schedule|set|add|a|an|the|at|on|for|this|next|coming)'
        clean_title = re.sub(rf'^{noise_words}\s+', '', temp_title, flags=re.IGNORECASE)
        clean_title = re.sub(rf'\s+{noise_words}$', '', clean_title, flags=re.IGNORECASE)
            
        # 5. AMBIGUITY DETECTION (Numeric but unclear)
        # If it's "at 8" with no am/pm or colon, we can locally resolve the ambiguity
        if not re.search(r'(am|pm|:)', start_str):
            try:
                hour = int(re.search(r'(\d+)', start_str).group(1))
                if 1 <= hour <= 12:
                    # Locally generate ambiguity result
                    import json
                    title = clean_title.strip().title() or "New Activity"
                    
                    # Create parameters for the two options
                    pm_hour = hour + 12 if hour < 12 else 12
                    am_hour = hour if hour < 12 else 0
                    
                    # Note: We keep these local-time relative, services.py will normalize or 
                    # we can normalize now if base_date had tzinfo.
                    am_dt = datetime.combine(target_date.date(), datetime.strptime(f"{am_hour}:00", "%H:%M").time())
                    pm_dt = datetime.combine(target_date.date(), datetime.strptime(f"{pm_hour}:00", "%H:%M").time())
                    
                    if target_date.tzinfo:
                        am_dt = am_dt.replace(tzinfo=target_date.tzinfo).astimezone(timezone.utc)
                        pm_dt = pm_dt.replace(tzinfo=target_date.tzinfo).astimezone(timezone.utc)
                    
                    return {
                        "reasoning": "Momentra Fast-Path (Local Ambiguity Resolution)",
                        "tasks": [],
                        "commands": [],
                        "ambiguities": [{
                            "title": title,
                            "type": "missing_time",
                            "message": f"Is '{title}' at {hour} AM or {hour} PM?",
                            "options": [
                                {"label": f"{hour} AM", "value": json.dumps({"title": title, "start_time": am_dt.strftime("%Y-%m-%dT%H:%M:%SZ")})},
                                {"label": f"{hour} PM", "value": json.dumps({"title": title, "start_time": pm_dt.strftime("%Y-%m-%dT%H:%M:%SZ")})}
                            ]
                        }]
                    }
            except: pass
            return None # If weird number, fallback to AI
            
        # 5. Parse Start/End (Deterministic Path)
        start_time_part = dateutil.parser.parse(start_str).time()
        start_dt = datetime.combine(target_date.date(), start_time_part)
        
        # Attach the user's timezone if we have it
        if target_date.tzinfo:
            start_dt = start_dt.replace(tzinfo=target_date.tzinfo)
        
        end_dt = None
        if end_str:
            end_time_part = dateutil.parser.parse(end_str).time()
            end_dt = datetime.combine(target_date.date(), end_time_part)
            if target_date.tzinfo:
                end_dt = end_dt.replace(tzinfo=target_date.tzinfo)
            if end_dt <= start_dt: end_dt += timedelta(days=1)
            
        # 6. Extract Duration
        duration_match = re.search(r'for\s(\d+)\s?(hour|hr|min)', text)
        if duration_match and not end_dt:
            amount = int(duration_match.group(1))
            unit = duration_match.group(2)
            if "min" in unit:
                end_dt = start_dt + timedelta(minutes=amount)
            else:
                end_dt = start_dt + timedelta(hours=amount)
            text = text.replace(duration_match.group(0), "").strip()

        # 7. Final Normalization
        # CRITICAL: Normalize to UTC before adding 'Z'
        if start_dt.tzinfo:
            start_dt = start_dt.astimezone(timezone.utc)
        if end_dt and end_dt.tzinfo:
            end_dt = end_dt.astimezone(timezone.utc)
            
        iso_start = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        iso_end = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if end_dt else None
        
        return {
            "reasoning": "Momentra Fast-Path (Regex/Determined Patterns)",
            "tasks": [{
                "title": clean_title.strip().title() or "New Task",
                "start_time": iso_start,
                "end_time": iso_end,
                "description": original_text,
                "confidence": 0.98
            }],
            "commands": [],
            "ambiguities": []
        }

    except Exception as e:
        print(f"Local Parser Error: {e}")
        return None

