"""
Turn Manager - Handles user intent classification and turn routing

RESPONSIBILITY:
- Classify user intent (answer question, go back, correct previous answer, etc.)
- Route to appropriate handler
- Manage conversation flow at the turn level

CLASSIFICATION STRATEGY:
- Cases 1-30: Keyword-based (fast, free, accurate for 80% of cases)
- Cases 31-38: LLM fallback for complex semantic understanding
- Priority Order: go_back > change_previous_answer > request_clarification > answer_question > unclear

DOES NOT:
- Store state (uses State Manager)
- Generate questions (uses Flow Controller)
- Validate business rules (uses Validator)
"""

from typing import Dict, Any, Tuple, Optional
import re
import os
import json
from google import genai
from google.genai import types


class TurnManager:
    """Manages individual conversation turns and classifies user intent"""
    
    def __init__(self, state_manager, use_llm_fallback: bool = True):
        """Initialize with state manager reference
        
        Args:
            state_manager: StateManager instance for accessing conversation state
            use_llm_fallback: Whether to use LLM for complex cases (default: True)
        """
        self.state_manager = state_manager
        self.use_llm_fallback = use_llm_fallback
        
        # Keywords for intent classification (Priority Order)
        self.go_back_keywords = ['back', 'previous', 'return', 'undo', 'earlier']
        # Note: 'correct' removed - it conflicts with confirmations like "that is correct"
        # Use 'correction' or 'correct the/this/that' patterns instead
        self.correction_keywords = ['change', 'actually', 'meant', 'should be', 'revise', 'update', 'i mean', 'correct the', 'correct this', 'correct that', 'correction']
        self.clarification_keywords = [
            'what', 'how', 'why', 'explain', 'help', "don't understand",
            'tell me', 'can you', 'could you', 'would you', 'describe', 'definition',
            'difference', 'confused', 'clarify', 'understand'
        ]

        # Confirmation keywords - user accepting suggestions
        self.confirmation_keywords = [
            'yes', 'yeah', 'yep', 'y', 'yup', 'sure', 'ok', 'okay',
            'confirm', 'confirmed', 'correct', 'right', "that's right", 'thats right',
            'looks good', 'sounds good', 'that works', 'perfect', 'great',
            'go ahead', 'proceed', 'accept', 'approved', 'good', 'fine',
            'alright', 'all right', 'absolutely', 'definitely', 'yes please',
            'that looks right', 'that looks correct', 'looks correct'
        ]

        # Rejection keywords - user disagreeing with suggestions
        self.rejection_keywords = [
            'no', 'nope', 'n', 'nah', 'not quite', 'not exactly', 'not right',
            'incorrect', 'wrong', 'disagree', 'reject', 'denied', 'not correct',
            "that's wrong", 'thats wrong', "that's not right", 'thats not right'
        ]

             
        # Initialize LLM client if available
        self.llm_client = None
        if use_llm_fallback:
            self._init_llm_client()
    
    def _init_llm_client(self):
        """Initialize Google Gemini LLM client for complex cases"""
        try:
            api_key = os.getenv('GEMINI_API_KEY')
            if api_key:
                self.llm_client = genai.Client(api_key=api_key)
                self.model = "gemini-2.0-flash"
        except Exception:
            pass  # LLM fallback not available
    
    def _detect_ambiguous_intent(self, user_input_lower: str, context: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        """Detect if user input has ambiguous/conflicting intent signals
        
        Returns:
            Tuple of (is_ambiguous, keyword_analysis)
            - is_ambiguous: True if multiple intent types detected
            - keyword_analysis: Dict with detected keyword types
        """
        detected_intents = {}
        
        # Check for each intent type
        if self._has_keywords(user_input_lower, self.go_back_keywords):
            detected_intents['go_back'] = True

        if self._has_keywords(user_input_lower, self.correction_keywords):
            detected_intents['correction'] = True

        if self._has_keywords(user_input_lower, self.clarification_keywords):
            detected_intents['clarification'] = True

        if self._has_keywords(user_input_lower, self.confirmation_keywords):
            detected_intents['confirmation'] = True

        if self._has_keywords(user_input_lower, self.rejection_keywords):
            detected_intents['rejection'] = True

        # Ambiguous if multiple intent types detected
        # Exception: clarification can co-exist (questions are common)
        non_clarification_intents = [k for k in detected_intents.keys() if k != 'clarification']
        is_ambiguous = len(non_clarification_intents) >= 2

        return is_ambiguous, detected_intents
    
    def _llm_semantic_classify(self, user_input: str, context: Dict[str, Any], keyword_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Use LLM to disambiguate user intent when keywords conflict
        
        Args:
            user_input: The user's message
            context: Conversation context
            keyword_analysis: Which keyword types were detected
            
        Returns:
            Classification result with intent and confidence
        """
        if not self.llm_client:
            # No LLM available, return error
            return {
                'intent': 'error',
                'classification_method': 'llm_unavailable',
                'message': 'LLM not available for disambiguation'
            }
        
        try:
            # Build prompt with few-shot examples and context
            prompt = self._build_disambiguation_prompt(user_input, context, keyword_analysis)
            
            # Call Gemini with low temperature for consistency
            response = self.llm_client.models.generate_content(
                model=self.model,
                contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1  # Low temp for consistent results
                )
            )
            
            if response.text:
                # Parse LLM response
                llm_result = json.loads(response.text)
                intent = llm_result.get('intent', 'unclear')
                confidence = llm_result.get('confidence', 'low')
                reasoning = llm_result.get('reasoning', '')
                extracted_value = llm_result.get('extracted_value')
                
                # Build result based on intent
                result = {
                    'intent': intent,
                    'classification_method': 'llm',
                    'confidence': confidence,
                    'llm_reasoning': reasoning
                }
                
                if extracted_value:
                    result['extracted_value'] = extracted_value
                
                # Add intent-specific fields
                if intent == 'change_previous_answer':
                    result['proposed_change'] = llm_result.get('proposed_change', {})
                elif intent == 'go_back':
                    result['target_question'] = llm_result.get('target_question')
                elif intent == 'request_clarification':
                    result['clarification_topic'] = llm_result.get('clarification_topic', '')
                    result['needs_explanation'] = True
                elif intent == 'confirm':
                    result['confirming'] = context.get('pending_suggestion')
                elif intent == 'reject':
                    result['rejecting'] = context.get('pending_suggestion')
                elif intent == 'answer_question':
                    result['next_action'] = 'continue_to_next_question'
                elif intent == 'unclear':
                    result['should_provide_help'] = True
                    result['should_provide_examples'] = True
                
                return result
            else:
                # Empty response from LLM
                return {
                    'intent': 'error',
                    'classification_method': 'llm',
                    'message': 'Empty LLM response'
                }
                
        except Exception as e:
            # LLM call failed - return error
            return {
                'intent': 'error',
                'classification_method': 'llm',
                'message': f'LLM error: {str(e)}'
            }
    
    def _build_disambiguation_prompt(self, user_input: str, context: Dict[str, Any], keyword_analysis: Dict[str, Any]) -> str:
        """Build prompt for LLM intent disambiguation with few-shot examples"""
        
        current_q = context.get('current_question', 'unknown')
        previous_q = context.get('previous_question', 'unknown')
        previous_a = context.get('previous_answer', 'unknown')
        awaiting_confirmation = context.get('awaiting_confirmation', False)
        pending_suggestion = context.get('pending_suggestion', 'unknown')
        
        prompt = f"""You are an intent classifier for a payroll configuration system.

CONTEXT:
Current question: {current_q}
Previous question: {previous_q}
Previous answer: {previous_a}
Awaiting confirmation: {awaiting_confirmation}
Pending suggestion: {pending_suggestion}

USER INPUT: "{user_input}"

KEYWORD ANALYSIS:
Detected keyword types: {', '.join(keyword_analysis.keys()) if keyword_analysis else 'none'}


TASK: Classify the user's PRIMARY intent into ONE category:

1. answer_question - Responding to current question
2. go_back - Return to previous step
3. change_previous_answer - Correct earlier answer
4. request_clarification - Asking for explanation
5. confirm - Accepting suggestion (only if awaiting_confirmation=True)
6. reject - Rejecting suggestion (only if awaiting_confirmation=True)
7. unclear - Cannot determine intent

RULES:
- If awaiting_confirmation=True and user says yes/confirm/correct → "confirm"
- If awaiting_confirmation=True and user says no/wrong/incorrect → "reject"
- If user says "back" or "previous" → "go_back"
- If user says "actually" or "change" → "change_previous_answer"
- If user asks a question (contains ?) → "request_clarification"
- If providing info for current question → "answer_question"

GUIDELINES:
- If user provides a specific new value (like "Texas"), they're likely correcting, not navigating
- Navigation ("go back") is about moving to a different question
- Correction is about changing a previous answer while staying on current flow
- Look at the PRIMARY intent, not just keywords
- For field names, use SHORT names like "state", "employees", "pay_frequency" (NOT full questions)

Respond ONLY with this JSON structure:
{{
  "intent": "<one of: go_back, change_previous_answer, request_clarification, answer_question, unclear>",
  "confidence": "<high, medium, or low>",
  "reasoning": "<brief explanation of why>",
  "extracted_value": "<value if answering or correcting, null otherwise>",
  "proposed_change": {{"field": "state|employees|pay_frequency|etc", "new_value": "<value>"}} (only for change_previous_answer),
  "target_question": "<short field name like 'state'>" (only for go_back),
  "clarification_topic": "<topic>" (only for request_clarification)
}}

EXAMPLES OF FIELD NAMES:
- "What state is your company in?" → field: "state"
- "How many employees?" → field: "employees"  
- "What's the pay frequency?" → field: "pay_frequency"
"""
        
        return prompt
    
    def process_user_turn(self, conversation_id: str, user_input: str, 
                         current_question: Optional[str] = None,
                         previous_question: Optional[str] = None,
                         previous_answer: Optional[Any] = None,
                         conversation_history: Optional[list] = None) -> Dict[str, Any]:
        """Main entry point - classify intent and route appropriately
        
        Args:
            conversation_id: The conversation ID
            user_input: What the user said
            current_question: The current question being asked (optional)
            previous_question: The previous question (optional)
            previous_answer: The user's previous answer (optional)
            conversation_history: Full conversation history for context (optional)
            
        Returns:
            Dict with:
                - intent: The classified intent type
                - classification_method: "keyword" or "llm"
                - Additional fields based on intent type
        """
        # Load current state
        state = self.state_manager.load_state(conversation_id)
        if not state:
            return {
                'intent': 'error',
                'classification_method': 'keyword',
                'message': 'Conversation not found'
            }
        
        # Build context
        context = {
            'current_question': current_question or state.get('current_step'),
            'previous_question': previous_question,
            'previous_answer': previous_answer,
            'conversation_history': conversation_history or state.get('conversation_history', []),
            'configuration': state.get('configuration', {})
        }
        
        # Classify the user's intent
        result = self.classify_intent(user_input, context)
        
        return result
    
    def classify_intent(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Classify user intent with keyword-based classification first, LLM fallback for complex cases
        
        Priority Order: go_back > change_previous_answer > request_clarification > answer_question > unclear
        
        Args:
            user_input: What the user said
            context: Current conversation context
            
        Returns:
            Dict with intent and all relevant fields
        """
        user_input_lower = user_input.lower().strip()
        
        # Step 1: Check for ambiguous intent (conflicting keywords)
        is_ambiguous, keyword_analysis = self._detect_ambiguous_intent(user_input_lower, context)
        
        # Step 2: If ambiguous and LLM is available, use semantic classification
        if is_ambiguous and self.use_llm_fallback and self.llm_client:
            llm_result = self._llm_semantic_classify(user_input, context, keyword_analysis)
            
            # If LLM succeeded, use its result
            if llm_result.get('intent') != 'error':
                return llm_result
            
            # LLM failed - fall back to keyword priority order below
        
        # Step 3: Standard keyword-based classification (priority order)
        # FAST-PATH: Single-character inputs (1-9, a-d) are valid answers for list selection
        # This prevents them from being classified as "unclear" due to being too short
        user_input_stripped = user_input.strip()
        if len(user_input_stripped) == 1 and (user_input_stripped.isdigit() or user_input_stripped.lower() in 'abcd'):
            return self._classify_answer(user_input, context)
        
        # PRIORITY 1: Check for go_back intent
        if self._has_keywords(user_input_lower, self.go_back_keywords):
            return self._classify_go_back(user_input, user_input_lower, context)
        
        # PRIORITY 2: Check for change_previous_answer intent
        # Check both traditional correction keywords AND value-only prefixes
        if self._has_keywords(user_input_lower, self.correction_keywords) or self._has_value_only_prefix(user_input_lower):
            return self._classify_correction(user_input, user_input_lower, context)
        
        # PRIORITY 3: Check for confirm intent (only if awaiting confirmation)
        if context.get('awaiting_confirmation') and self._has_keywords(user_input_lower, self.confirmation_keywords):
            return {
                'intent': 'confirm',
                'confidence': 'high',
                'classification_method': 'keyword',
                'confirming': context.get('pending_suggestion')
            }
        
        # PRIORITY 4: Check for reject intent (only if awaiting confirmation)
        if context.get('awaiting_confirmation') and self._has_keywords(user_input_lower, self.rejection_keywords):
            return {
                'intent': 'reject',
                'confidence': 'high',
                'classification_method': 'keyword',
                'rejecting': context.get('pending_suggestion')
            }
        
        # PRIORITY 5: Check for request_clarification intent (questions take precedence)
        # Questions should be treated as clarifications even if they contain correction keywords
        # Check multiple signals: question mark, keywords, AND interrogative sentence patterns
        is_question = (
            user_input.strip().endswith('?') or 
            self._has_keywords(user_input_lower, self.clarification_keywords) or
            self._is_interrogative_pattern(user_input_lower)
        )
        if is_question:
            return self._classify_clarification(user_input, user_input_lower, context)
        
        # Check for unclear intent (gibberish, off-topic, vague)
        if self._is_unclear(user_input, user_input_lower, context):
            return self._classify_unclear(user_input, context)
        
        # PRIORITY 6: Default to answer_question
        return self._classify_answer(user_input, context)
    
    def _has_keywords(self, text: str, keywords: list) -> bool:
        """Check if text contains any of the keywords"""
        return any(keyword in text for keyword in keywords)
    
    def _is_interrogative_pattern(self, text: str) -> bool:
        """Check if text follows an interrogative sentence pattern (questions without '?')
        
        Detects patterns like:
        - "what is X"
        - "what does X mean"
        - "how does X work"
        - "can you explain X"
        - "tell me about X"
        
        Args:
            text: Lowercase user input
            
        Returns:
            True if the text matches an interrogative pattern
        """
        interrogative_patterns = [
            # "What is/are/does/do" patterns
            r'^what\s+is\b',
            r'^what\s+are\b',
            r'^what\s+does\b',
            r'^what\s+do\b',
            # "How" patterns
            r'^how\s+do\b',
            r'^how\s+does\b',
            r'^how\s+is\b',
            r'^how\s+are\b',
            r'^how\s+can\b',
            # "Can/Could you" patterns
            r'^can\s+you\s+(explain|tell|describe|help)',
            r'^could\s+you\s+(explain|tell|describe|help)',
            r'^would\s+you\s+(explain|tell|describe|help)',
            # "Tell/Explain me" patterns
            r'^tell\s+me\s+(about|what|how)',
            r'^explain\s+(to\s+me|what|how|the)',
            # "Why" patterns
            r'^why\s+(is|are|do|does|would|should)',
            # "When/Where" patterns
            r'^when\s+(is|are|do|does)',
            r'^where\s+(is|are|do|does)',
            # "Which" patterns
            r'^which\s+(is|are|one)',
            # "Who" patterns
            r'^who\s+(is|are)',
            # "I don't understand" patterns
            r"^i\s+(don't|do\s+not)\s+understand",
            r"^i'm\s+(confused|not\s+sure)",
        ]
        
        for pattern in interrogative_patterns:
            if re.match(pattern, text):
                return True
        
        return False
    
    def _has_value_only_prefix(self, text: str) -> bool:
        """Check if text starts with a value-only correction prefix
        
        These are phrases that indicate a correction without naming the field:
        - "change my mind, [value]"
        - "on second thought, [value]"
        - "wait, [value]" (but not "wait, what..." which is clarification)
        - "I meant [value]"
        - "make that [value]"
        """
        # Safeguard for "wait,": if it's followed by interrogatives or question mark, it's clarification
        if text.startswith('wait,'):
            # Check for interrogative words and auxiliary verbs that form questions
            interrogatives = ['what', 'how', 'why', 'who', 'when', 'where', 'which', 'whose', 'whom',
                            'is', 'are', 'was', 'were', 'do', 'does', 'did', 
                            'can', 'could', 'should', 'would', 'will', 'shall']
            if any(f' {q}' in text for q in interrogatives) or text.endswith('?'):
                return False
        
        value_only_prefixes = [
            'change my mind',
            'changed my mind',
            'on second thought',
            'wait,',
            'i meant',
            'make that'
        ]
        
        return any(text.startswith(prefix) for prefix in value_only_prefixes)
    
    def _is_unclear(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> bool:
        """Determine if input is unclear (gibberish, off-topic, vague)
        
        Enhanced detection for:
        - Very short random input
        - Keyboard smashing (asdf, qwerty patterns)
        - Low vowel ratio (consonant-heavy gibberish)
        - Repeated patterns
        - Vague/ambiguous responses
        """
        stripped = user_input.strip()
        
        # Handle single character input
        if len(stripped) == 1:
            # Valid option selection: letters a-h or digits
            if stripped.lower() in 'abcdefgh' or stripped.isdigit():
                return False  # Valid option selection
            return True  # Random single char like 'x', 'q', etc.
        
        # Very short input (less than 2 chars but not single valid char)
        if len(stripped) < 2:
            return True
        
        # Check for keyboard smash patterns (common sequences)
        keyboard_patterns = ['asdf', 'qwer', 'zxcv', 'hjkl', 'uiop', 'bnm', 'fgh', 'jkl', 'sdfg', 'dfgh', 'fghj', 'ghjk']
        input_no_spaces = user_input_lower.replace(' ', '')
        for pattern in keyboard_patterns:
            if pattern in input_no_spaces:
                return True
        
        # Check for random character sequences (gibberish)
        # Only apply to pure alphabetic input of 4+ chars
        alpha_only = ''.join(c for c in user_input_lower if c.isalpha())
        if len(alpha_only) >= 4:
            # Calculate vowel ratio (including 'y' as sometimes a vowel)
            vowel_count = sum(1 for c in alpha_only if c in 'aeiouy')
            vowel_ratio = vowel_count / len(alpha_only)
            
            # Very low vowel ratio is likely gibberish
            # Normal English has ~38% vowels (even more with 'y')
            # Words like "monthly" (14% with aeiou, 28% with aeiouy) are valid
            if vowel_ratio < 0.08 and len(alpha_only) >= 5:
                return True
            
            # Low vowel ratio with 8+ chars is suspicious
            if vowel_ratio < 0.10 and len(alpha_only) >= 8:
                return True
        
        # Check for repeated single character (xxx, xxxx, aaaaa, etc.)
        # This catches short repeated strings like "xxxx" that slip through other checks
        if len(stripped) >= 3:
            first_char = stripped[0].lower()
            if first_char.isalpha() and all(c.lower() == first_char for c in stripped):
                return True  # All same character repeated
        
        # Check for repeated patterns (asdfasdf = asdf repeated)
        if len(user_input_lower) >= 6:
            half_len = len(user_input_lower) // 2
            if len(user_input_lower) % 2 == 0:
                if user_input_lower[:half_len] == user_input_lower[half_len:]:
                    return True  # Repeated pattern detected
            
            # Check for triple character repetition (aaa, bbb, etc.)
            for i in range(len(user_input_lower) - 2):
                if user_input_lower[i] == user_input_lower[i+1] == user_input_lower[i+2]:
                    if user_input_lower[i].isalpha():  # Only flag for letters, not numbers
                        return True
        
        # Vague responses
        vague_responses = ['hmm', 'uhh', 'um', 'err', 'uh', 'huh', 'meh', 'idk', 'dunno']
        if user_input_lower in vague_responses:
            return True
        if len(user_input.split()) <= 2 and any(user_input_lower.startswith(v) for v in vague_responses):
            return True
        
        # Ambiguous references without context
        ambiguous = ['same as before', 'like before', 'same thing', 'whatever', 'anything', 'idc']
        if any(phrase in user_input_lower for phrase in ambiguous):
            return True
        
        # Only punctuation or special characters
        if not any(c.isalnum() for c in stripped):
            return True
        
        return False
    
    def _classify_go_back(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Classify as go_back intent"""
        result = {
            'intent': 'go_back',
            'classification_method': 'keyword',
            'target_question': context.get('previous_question', 'previous question'),
            'previous_answer': context.get('previous_answer'),
            'confidence': 'high'
        }
        
        # Check if user also wants to make a change (Test Case 31)
        if self._has_keywords(user_input_lower, self.correction_keywords):
            # Extract proposed change - special handling for "and change X to Y"
            proposed_change = self._extract_change_with_navigation(user_input, user_input_lower, context)
            if proposed_change:
                result['proposed_change'] = proposed_change
        
        return result
    
    def _classify_correction(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Classify as change_previous_answer intent"""
        
        # Check if there's a question mark (Test Case 32: "ok?" should not override change intent)
        if user_input.endswith('?') and len(user_input.split()) > 5:
            # This is likely "change X ok?" pattern, not a clarification
            pass
        
        # Extract field, old value, and new value
        field_info = self._extract_change(user_input, user_input_lower, context)
        
        # Determine confidence level
        confidence = 'high'
        if not field_info or field_info.get('new_value') == 'unknown':
            confidence = 'medium'
        elif field_info.get('inferred_field', False):
            # If we had to infer the field, confidence is medium
            confidence = 'medium'
        
        result = {
            'intent': 'change_previous_answer',
            'classification_method': 'keyword',
            'target_question': context.get('current_question', ''),
            'confidence': confidence
        }
        
        # Add field information if extracted
        if field_info:
            result['field_to_change'] = field_info.get('field', 'unknown')
            result['old_value'] = field_info.get('old_value')
            result['new_value'] = field_info.get('new_value', 'unknown')
            
            if result['new_value'] == 'unknown':
                result['needs_clarification'] = True
            
            # For proposed_change format (Test Case 32)
            if all(k in field_info for k in ['field', 'old_value', 'new_value']):
                result['proposed_change'] = {
                    'field': field_info['field'],
                    'old_value': field_info['old_value'],
                    'new_value': field_info['new_value']
                }
        
        return result
    
    def _classify_clarification(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Classify as request_clarification intent"""
        
        # Special case: "Wait, what..." should prioritize clarification over go_back (Test Case 33)
        if 'wait' in user_input_lower and any(word in user_input_lower for word in ['what', 'why', 'how']):
            pass  # Clarification wins
        
        # Extract clarification topic
        topic = self._extract_clarification_topic(user_input, user_input_lower, context)
        
        result = {
            'intent': 'request_clarification',
            'classification_method': 'keyword',
            'target_question': context.get('current_question', ''),
            'clarification_topic': topic,
            'confidence': 'high'
        }
        
        # Check if user needs explanation vs just asking a question
        needs_explanation_keywords = ['explain', 'what does', 'what is', 'how do', 'why', "don't understand", 'help']
        # Also check for simple question mark (single word + ?)
        if any(keyword in user_input_lower for keyword in needs_explanation_keywords) or user_input.strip().endswith('?'):
            result['needs_explanation'] = True
        
        return result
    
    def _classify_answer(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Classify as answer_question intent"""
        
        # Extract the likely answer value
        extracted_value = self._extract_answer_value(user_input, context)
        
        return {
            'intent': 'answer_question',
            'classification_method': 'keyword',
            'extracted_value': extracted_value,
            'target_question': None,
            'confidence': 'high',
            'next_action': 'continue_to_next_question'
        }
    
    def _classify_unclear(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Classify as unclear intent"""
        return {
            'intent': 'unclear',
            'classification_method': 'keyword',
            'target_question': context.get('current_question', ''),
            'should_provide_help': True,
            'should_provide_examples': True,
            'confidence': 'high'
        }
    
    def _extract_change(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract field name, old value, and new value from correction intent
        
        Patterns:
        - "change [field] to [value]"
        - "actually, [value]"
        - "[field] should be [value]"
        - "not [old], should be [new]"
        """
        
        # Pattern 1: "change [field] to [value]" - preserve case for value and strip trailing punctuation
        match = re.search(r'change\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+to\s+([^\s,]+(?:\s+[^\s,]+)?)', user_input_lower)
        if match:
            field = match.group(1).strip()
            # Extract from original input to preserve case
            original_match = re.search(r'to\s+(.+?)(?:\s+ok\??|\s+please|\?|$)', user_input, re.IGNORECASE)
            new_value = original_match.group(1).strip() if original_match else match.group(2).strip()
            # Strip trailing "ok", "ok?", "please", etc.
            new_value = re.sub(r'\s*(ok\??|please|thanks?)$', '', new_value, flags=re.IGNORECASE).strip()
            old_value = self._get_previous_value(field, context)
            return {
                'field': field.replace(' ', '_'),
                'old_value': old_value,
                'new_value': new_value,
                'inferred_field': False
            }
        
        # Pattern 2: "correct [field] to [value]"
        match = re.search(r'correct\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+to\s+([^\s,]+(?:\s+[^\s,]+)?)', user_input_lower)
        if match:
            field = match.group(1).strip()
            # Extract from original input to preserve case
            original_match = re.search(r'to\s+([^\s,]+(?:\s+[^\s,]+)?)', user_input, re.IGNORECASE)
            new_value = original_match.group(1).strip() if original_match else match.group(2).strip()
            old_value = self._get_previous_value(field, context)
            return {
                'field': field.replace(' ', '_'),
                'old_value': old_value,
                'new_value': new_value,
                'inferred_field': False
            }
        
        # Pattern 3: "not [old], should be [new]"
        match = re.search(r'not\s+([^,]+),\s+should\s+be\s+(.+)', user_input_lower)
        if match:
            old_value = match.group(1).strip()
            new_value = match.group(2).strip()
            field = self._infer_field_from_value(old_value, context)
            return {
                'field': field,
                'old_value': old_value,
                'new_value': new_value,
                'inferred_field': True
            }
        
        # Pattern 4: "actually, [value]" or "meant to say [value]"
        match = re.search(r'(?:actually|meant to say),?\s+(.+)', user_input_lower)
        if match:
            # Extract from original input to preserve case
            original_match = re.search(r'(?:actually|meant to say),?\s+(.+)', user_input, re.IGNORECASE)
            new_value = original_match.group(1).strip() if original_match else match.group(1).strip()
            # Infer field from most recent answer
            field = self._infer_field_from_recent_answers(context)
            old_value = self._get_previous_value(field, context)
            return {
                'field': field,
                'old_value': old_value,
                'new_value': new_value,
                'inferred_field': True
            }
        
        # Pattern 5: Value-only corrections with lightweight prefixes
        # "change my mind, [value]", "on second thought, [value]", "wait, [value]", "I meant [value]"
        value_only_patterns = [
            r'change(?:d)?\s+my\s+mind,?\s+(.+)',
            r'on\s+second\s+thought,?\s+(.+)',
            r'wait,\s+(.+)',
            r'i\s+meant,?\s+(.+)',
            r'make\s+that\s+(.+)'
        ]
        
        for pattern in value_only_patterns:
            match = re.search(pattern, user_input_lower)
            if match:
                # Extract from original input to preserve case
                original_match = re.search(pattern, user_input, re.IGNORECASE)
                new_value = original_match.group(1).strip() if original_match else match.group(1).strip()
                # Strip trailing punctuation like "ok", "please", etc.
                new_value = re.sub(r'\s*(ok\??|please|thanks?)$', '', new_value, flags=re.IGNORECASE).strip()
                
                # Infer field from most recent answer
                field = self._infer_field_from_recent_answers(context)
                if not field:
                    # No previous field to infer from
                    return None
                
                old_value = self._get_previous_value(field, context)
                return {
                    'field': field,
                    'old_value': old_value,
                    'new_value': new_value,
                    'inferred_field': True
                }
        
        # Pattern 6: "[value] should be [new_value]" (inferred correction)
        match = re.search(r'should be\s+(.+)', user_input_lower)
        if match:
            # Extract from original input to preserve case
            original_match = re.search(r'should be\s+(.+)', user_input, re.IGNORECASE)
            new_value = original_match.group(1).strip() if original_match else match.group(1).strip()
            field = self._infer_field_from_recent_answers(context)
            old_value = self._get_previous_value(field, context)
            return {
                'field': field,
                'old_value': old_value,
                'new_value': new_value,
                'inferred_field': True
            }
        
        return None
    
    def _extract_change_with_navigation(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract change from input that also contains navigation (like "go back and change X to Y")"""
        # Pattern: "and change [X] to [Y]" or "change [X] to [Y]"
        match = re.search(r'(?:and )?change\s+(\w+(?:\s+\w+)?)\s+to\s+([^\s,]+(?:\s+[^\s,]+)?)', user_input_lower)
        if match:
            old_value_lower = match.group(1).strip()
            # Extract from original input to preserve case
            original_match = re.search(r'change\s+(\w+(?:\s+\w+)?)\s+to\s+([^\s,]+(?:\s+[^\s,]+)?)', user_input, re.IGNORECASE)
            if original_match:
                old_value = original_match.group(1).strip()
                new_value = original_match.group(2).strip()
            else:
                old_value = old_value_lower
                new_value = match.group(2).strip()
            
            # Infer field from the old value
            field = self._infer_field_from_value(old_value_lower, context)
            
            return {
                'field': field,
                'old_value': old_value,
                'new_value': new_value
            }
        
        # Fallback to regular change extraction
        return self._extract_change(user_input, user_input_lower, context)
    
    def _extract_clarification_topic(self, user_input: str, user_input_lower: str, context: Dict[str, Any]) -> str:
        """Extract what the user is asking about - enhanced for keyword matching
        
        Returns the full clarification topic for matching against YAML clarifications.
        Preserves multi-word phrases and comparison patterns.
        """
        
        # Pattern: "difference between X and Y" or "X vs Y"
        match = re.search(r'(?:difference between|compare)\s+(.+?)\s+(?:and|vs|versus)\s+(.+?)(?:\?|$)', user_input_lower)
        if match:
            term1 = match.group(1).strip()
            term2 = match.group(2).strip()
            return f"{term1} vs {term2}"
        
        # Pattern: "X or Y?" (comparison question)
        match = re.search(r'^(?:what (?:is|\'s) )?(.+?)\s+or\s+(.+?)\??$', user_input_lower)
        if match:
            term1 = match.group(1).strip()
            term2 = match.group(2).strip()
            return f"{term1} or {term2}"
        
        # Pattern: "What does [term] mean?" - Extract just the term, not "mean"
        match = re.search(r'what (?:does|is) ([^?]+?) (?:mean|do)', user_input_lower)
        if match:
            topic = match.group(1).strip()
            # Remove trailing words like "mean"
            topic = topic.replace(' mean', '').strip()
            return topic
        
        # Pattern: "What is [term]?" or "What's [term]?"
        match = re.search(r'what(?:\'s| is) (?:a |an |the )?([^?]+)', user_input_lower)
        if match:
            topic = match.group(1).strip()
            # Clean up common articles and filler words at the end
            topic = re.sub(r'\s+(mean|do|for)$', '', topic)
            return topic
        
        # Pattern: "Explain [topic]" or "Tell me about [topic]"
        match = re.search(r'(?:explain|tell me about|describe) (?:what is |the )?(.+)', user_input_lower)
        if match:
            return match.group(1).strip().rstrip('?')
        
        # Pattern: "Which [option] should I [do]?" - Extract full question for matching
        match = re.search(r'which\s+(.+?)(?:\?|$)', user_input_lower)
        if match:
            rest = match.group(1).strip()
            # If it's just "should i choose" or similar, return "which should i choose"
            if re.match(r'^(?:should i|do i|one)', rest):
                return 'which should i choose'
            # If it's "pay schedule should i...", extract just the subject
            subject_match = re.match(r'(.+?)\s+(?:should i|do i)', rest)
            if subject_match:
                return subject_match.group(1).strip()
            # Otherwise return the full "which [thing]" phrase
            return f"which {rest}".rstrip('?').strip()
        
        # Pattern: "Why [action]?" - Extract the "why" question
        match = re.search(r'why (?:do i need to |should i |do you need |do i have to )?(.+?)(?:\?|$)', user_input_lower)
        if match:
            topic = match.group(1).strip()
            return f"why {topic}" if topic else "why"
        
        # Pattern: "How do/does [X] affect [Y]?" - Complex domain questions
        match = re.search(r'how (?:do|does) (.+?) (?:affect|impact|influence) (.+?)(?:\?|$)', user_input_lower)
        if match:
            subject = match.group(1).strip()
            object_ = match.group(2).strip()
            return f"how {subject} affect {object_}"
        
        # Pattern: Short question (1-3 words + ?)
        if user_input.endswith('?') and len(user_input.split()) <= 3:
            return user_input.rstrip('?').strip()
        
        # Default: Use user's full input (sanitized) instead of extracting from system's question
        # This ensures unmatched clarifications can be checked against YAML, and if no match,
        # properly trigger the LLM fallback in the orchestrator
        sanitized_input = user_input_lower.strip().rstrip('?!.').strip()
        
        # Safety guard: if input is too short or empty, use a safe fallback
        if len(sanitized_input) < 3:
            return 'general clarification'
        
        return sanitized_input
    
    def _extract_key_term_from_question(self, question: str) -> str:
        """Extract the key term from a question"""
        # Look for terms in common question patterns
        patterns = [
            r'What (?:is|are) (?:your|the) (.+)\?',
            r'Do you have (.+)\?',
            r'How (?:is|are) (.+)\?',
            r'provide your (.+)\?',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, question, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return 'this field'
    
    def _extract_answer_value(self, user_input: str, context: Dict[str, Any]) -> Any:
        """Extract the answer value from user input"""
        user_input_clean = user_input.strip()
        user_input_lower = user_input.lower()
        
        # Handle yes/no variations
        yes_variations = ['yes', 'yea', 'yeah', 'yep', 'y']
        no_variations = ['no', 'nope', 'n']
        
        # Check for yes variations in full text
        if any(variation in user_input_lower for variation in ['that is right', "that's right"]):
            return 'yes'
        
        if user_input_lower.strip() in yes_variations:
            return 'yes'
        if user_input_lower.strip() in no_variations:
            return 'no'
        
        # Try to parse as number
        try:
            if '.' in user_input_clean:
                return float(user_input_clean)
            return int(user_input_clean)
        except ValueError:
            pass
        
        # Extract key information from longer answers
        # Pattern: "I want to create a [value] pay schedule" - extract the adjective before "pay"
        match = re.search(r'(?:create|want|set up|use) (?:a |an )?(\w+)\s+(?:pay|schedule)', user_input_lower)
        if match:
            return match.group(1)
        
        # Fallback pattern for "create/want/use [value]"
        match = re.search(r'(?:create|want|set up|use) (?:a |an )?(\w+)', user_input_lower)
        if match:
            # Skip common stop words
            value = match.group(1)
            if value not in ['to', 'the', 'a', 'an']:
                return value
        
        # Pattern: "We only offer [value]"
        match = re.search(r'only offer (\w+)', user_input_lower)
        if match:
            return match.group(1)
        
        # Default: return as-is
        return user_input_clean
    
    def _get_previous_value(self, field: str, context: Dict[str, Any]) -> Optional[Any]:
        """Get the previous value for a field from context"""
        config = context.get('configuration', {})
        
        # Try direct field lookup
        for domain in config.values():
            if isinstance(domain, dict) and field in domain:
                return domain[field]
        
        # Try with underscores
        field_underscore = field.replace(' ', '_')
        for domain in config.values():
            if isinstance(domain, dict) and field_underscore in domain:
                return domain[field_underscore]
        
        return None
    
    def _infer_field_from_value(self, value: str, context: Dict[str, Any]) -> str:
        """Infer which field a value belongs to"""
        config = context.get('configuration', {})
        
        for domain in config.values():
            if isinstance(domain, dict):
                for field_name, field_value in domain.items():
                    if str(field_value).lower() == value.lower():
                        return field_name
        
        return 'unknown'
    
    def _infer_field_from_recent_answers(self, context: Dict[str, Any]) -> str:
        """Infer field from the most recent completed step
        
        When user wants to change their answer without specifying the field,
        we look at the most recently completed step to determine which field to update.
        """
        # Get the most recently completed step
        completed_steps = context.get('completed_steps', [])
        if not completed_steps:
            return 'state'  # Fallback
        
        # Get the last completed step
        last_step = completed_steps[-1]
        
        # Map common steps to their corresponding fields
        # This mapping is based on the pay_period_workflow.yaml structure
        step_to_field = {
            'C1.1': 'assigned_ein',
            'C1.2': 'pay_frequency',
            'C1.3': 'schedule_name',
            'C1.4': 'workweek_start_day',
            'C1.5': 'first_pay_date',
            'C1.6': 'pay_date_pattern',
            'C1.7': 'weekend_adjustment',
            'C1.8': 'pay_day_of_week',
            'C1.9': 'first_period_end_date',
            'DOC.1': 'uploaded_documents',
        }
        
        # Return the field for the last completed step
        return step_to_field.get(last_step, 'state')
    
    # Legacy methods for backward compatibility with existing tests
    def handle_answer(self, user_input: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Process answer to current question (legacy method)"""
        return {
            'intent': 'answer_question',
            'action': 'process_answer',
            'message': None
        }
    
    def handle_backtrack(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Handle going back to previous step (legacy method)"""
        completed_steps = state.get('completed_steps', [])
        
        if not completed_steps:
            return {
                'intent': 'go_back',
                'action': 'none',
                'message': "We're at the beginning - there's nothing to go back to."
            }
        
        return {
            'intent': 'go_back',
            'action': 'go_to_previous_step',
            'message': "Okay, let's go back to the previous question."
        }
    
    def handle_correction(self, user_input: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Handle correcting a previous answer (legacy method)"""
        return {
            'intent': 'change_previous_answer',
            'action': 'identify_field_to_correct',
            'message': "I can help you change a previous answer. Which field would you like to update?",
            'original_input': user_input
        }
    
    def handle_unclear_input(self, user_input: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Handle input we don't understand (legacy method)"""
        return {
            'intent': 'unclear',
            'action': 're_ask_question',
            'message': "I didn't quite understand that. Could you please rephrase?",
            'retry_count': state.get('retry_count', 0) + 1
        }
