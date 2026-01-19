import pytest
from unittest.mock import MagicMock, patch
from app.llm_adapter import LLMAdapter, AIParseResult, AICandidate, AICommand, AIAmbiguity

@pytest.fixture
def mock_openai_client():
    with patch("app.llm_adapter.client") as mock_client:
        yield mock_client

def test_parse_text_success(mock_openai_client):
    # Setup mock response
    mock_parsed_response = AIParseResult(
        reasoning="Test reasoning",
        tasks=[
            AICandidate(
                title="Test Task",
                start_time="2026-01-01T10:00:00Z",
                end_time="2026-01-01T11:00:00Z",
                confidence=0.9
            )
        ],
        commands=[],
        ambiguities=[]
    )
    
    # Configure the mock chain: client.beta.chat.completions.parse().choices[0].message.parsed
    mock_completion = MagicMock()
    mock_completion.choices[0].message.parsed = mock_parsed_response
    mock_openai_client.beta.chat.completions.parse.return_value = mock_completion

    adapter = LLMAdapter()
    result = adapter.parse_text("Start a test task")

    assert result["reasoning"] == "Test reasoning"
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["title"] == "Test Task"
    assert result["tasks"][0]["confidence"] == 0.9

def test_parse_text_ambiguity(mock_openai_client):
    # Setup mock response for ambiguity
    mock_parsed_response = AIParseResult(
        reasoning="Ambiguous time",
        tasks=[],
        commands=[],
        ambiguities=[
            AIAmbiguity(
                title="Dinner",
                type="missing_time",
                message="Time?",
                options=[]
            )
        ]
    )

    mock_completion = MagicMock()
    mock_completion.choices[0].message.parsed = mock_parsed_response
    mock_openai_client.beta.chat.completions.parse.return_value = mock_completion

    adapter = LLMAdapter()
    result = adapter.parse_text("Dinner")

    assert len(result["ambiguities"]) == 1
    assert result["ambiguities"][0]["title"] == "Dinner"
