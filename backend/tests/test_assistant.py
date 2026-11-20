from fastapi.testclient import TestClient
from app.main import create_app
from app.assistant import LocalAssistant


def test_assistant_context_is_server_selected_and_bounded(tmp_path, monkeypatch):
    captured = []
    def answer(self, question, context):
        captured.append(context)
        return {'answer': 'Test transport only', 'evidence': context, 'model': 'stub', 'limited': False}
    monkeypatch.setattr(LocalAssistant, 'answer', answer)
    with TestClient(create_app(tmp_path, seed=False)) as client:
        raw = b'DEPTH [m],RHOB [g/cm3]\n1,2.4\n2,-1\n3,2.5\n4,\n'
        well = client.post('/api/datasets/upload', files={'file': ('evidence.csv', raw)}).json()
        run = client.post('/api/analysis/run', json={'dataset_id': well['id'], 'curves': ['RHOB'], 'methods': ['physical','missing']}).json()
        body = {'analysis_id': run['id'], 'finding_index': 0, 'question': 'Почему?'}
        response = client.post('/api/assistant/ask', json=body)
        assert response.status_code == 200
        context = captured[0]
        assert context['analysis_id'] == run['id']
        assert len(context['shown_findings']) == 1
        assert context['shown_findings'][0]['number'] == 1
        assert len(context['measurement_examples']) <= 12
        assert context['source'] == 'upload'
        assert 'original' not in context
        assert client.post('/api/assistant/ask', json={**body, 'finding_index': 999}).status_code == 422
        assert client.post('/api/assistant/ask', json={**body, 'analysis_id': 'missing'}).status_code == 404
        assert client.post('/api/assistant/ask', json={**body, 'question': '   '}).status_code == 422
        assert client.get('/api/assistant/status').json()['installed'] is False


def test_missing_model_never_returns_fake_answer(tmp_path):
    engine = LocalAssistant(tmp_path)
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException) as error:
        engine.answer('Explain', {})
    assert error.value.status_code == 409
    assert engine.inference.acquire(blocking=False)
    engine.inference.release()
