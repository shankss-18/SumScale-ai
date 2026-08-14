"""
pytest configuration for OmniAid backend tests.
Sets up the async test client, environment overrides, in-memory MongoDB mock, and shared fixtures.
"""

import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from bson import ObjectId
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Inject a complete, valid test environment BEFORE importing main/config.
# This prevents sys.exit(1) from firing during test collection.
# ---------------------------------------------------------------------------
os.environ.setdefault("GEMINI_API_KEY", "test_gemini_key_not_a_placeholder")
os.environ.setdefault("SPEECH_TO_TEXT_API_KEY", "test_stt_key_not_a_placeholder")
os.environ.setdefault("GOOGLE_PLACES_API_KEY", "test_places_key_not_a_placeholder")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB_NAME", "omniaid_test")
os.environ.setdefault("JWT_SECRET_KEY", "a" * 64)  # 64-char dummy secret
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from main import app  # noqa: E402


class MockCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, key, direction=1):
        reverse = direction == -1
        self._docs.sort(key=lambda d: d.get(key, datetime.min), reverse=reverse)
        return self

    async def to_list(self, length=100):
        return [d.copy() for d in self._docs[:length]]


class MockCollection:
    def __init__(self):
        self.docs = []

    def _matches(self, doc, query):
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, cond) for cond in v):
                    return False
            elif k == "$in":
                pass
            elif k == "_id" and isinstance(v, ObjectId):
                if str(doc.get("_id")) != str(v):
                    return False
            elif "." in k:
                parts = k.split(".")
                curr = doc
                for part in parts:
                    if isinstance(curr, dict):
                        curr = curr.get(part)
                    else:
                        curr = None
                        break
                if curr != v:
                    return False
            elif isinstance(v, dict):
                field_val = doc.get(k)
                if field_val is None:
                    return False
                if "$lte" in v and not (field_val <= v["$lte"]):
                    return False
                if "$lt" in v and not (field_val < v["$lt"]):
                    return False
                if "$gt" in v and not (field_val > v["$gt"]):
                    return False
                if "$gte" in v and not (field_val >= v["$gte"]):
                    return False
                if "$in" in v and field_val not in v["$in"]:
                    return False
            elif doc.get(k) != v:
                return False
        return True

    async def find_one(self, query, sort=None):
        matching = [doc for doc in self.docs if self._matches(doc, query)]
        if not matching:
            return None
        if sort and isinstance(sort, list) and len(sort) > 0:
            key, direction = sort[0]
            reverse = direction == -1
            matching.sort(key=lambda d: d.get(key, datetime.min), reverse=reverse)
        return matching[0].copy()

    async def insert_one(self, doc):
        doc_copy = doc.copy()
        if "_id" not in doc_copy:
            doc_copy["_id"] = ObjectId()
        self.docs.append(doc_copy)

        class InsertResult:
            inserted_id = doc_copy["_id"]

        return InsertResult()

    async def update_one(self, query, update, upsert: bool = False):
        matched = False
        for doc in self.docs:
            if self._matches(doc, query):
                matched = True
                if "$set" in update:
                    for k, v in update["$set"].items():
                        doc[k] = v
                if "$push" in update:
                    for k, v in update["$push"].items():
                        if k not in doc or not isinstance(doc[k], list):
                            doc[k] = []
                        doc[k].append(v)

                class UpdateResult:
                    modified_count = 1

                return UpdateResult()

        if not matched and upsert:
            new_doc = query.copy()
            if "$set" in update:
                new_doc.update(update["$set"])
            self.docs.append(new_doc)
            class UpdateResult:
                modified_count = 1
            return UpdateResult()

        class UpdateResult:
            modified_count = 0

        return UpdateResult()

    async def update_many(self, query, update):
        modified_count = 0
        for doc in self.docs:
            if self._matches(doc, query):
                if "$set" in update:
                    for k, v in update["$set"].items():
                        doc[k] = v
                modified_count += 1

        class UpdateResult:
            pass

        res = UpdateResult()
        res.modified_count = modified_count
        return res

    async def delete_one(self, query):
        for idx, doc in enumerate(self.docs):
            if self._matches(doc, query):
                del self.docs[idx]

                class DeleteResult:
                    deleted_count = 1

                return DeleteResult()

        class DeleteResult:
            deleted_count = 0

        return DeleteResult()

    def find(self, query):
        results = [doc for doc in self.docs if self._matches(doc, query)]
        return MockCursor(results)


class MockDatabase:
    def __init__(self):
        self.users = MockCollection()
        self.cases = MockCollection()
        self.reminders = MockCollection()
        self.otp_verifications = MockCollection()
        self.trust_circle = MockCollection()
        self.safety_alerts = MockCollection()
        self.push_subscriptions = MockCollection()
        self.notification_logs = MockCollection()


@pytest.fixture(autouse=True)
def mock_db_fixture():
    mock_db = MockDatabase()
    app.state.db = mock_db
    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = False
    yield mock_db
    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = True


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac
