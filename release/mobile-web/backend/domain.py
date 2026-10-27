from collections import Counter
from datetime import datetime, timezone
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool

AXES = [("咸味", "偏咸"), ("甜味", "偏甜"), ("酸味", "偏酸"), ("辣味", "偏辣"), ("鲜味", "鲜香"), ("油感", "偏油")]
BUDGETS = {"under10": 10, "10to15": 15, "15to20": 20, "20to30": 30, "30to40": 40,
           "40to60": 60, "60to100": 100, "over100": None, "unlimited": None,
           "under15": 15, "15to25": 25, "25to40": 40}


def fail(message, status=422):
    raise HTTPException(status, message)


def uid(value=None):
    try:
        return str(UUID(str(value))) if value else str(uuid4())
    except ValueError:
        fail("标识格式不正确")


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def zone(name):
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        fail("时区不正确")


def strings(values, count, length, label):
    if not isinstance(values, list) or len(values) > count or any(not isinstance(x, str) or not x.strip() or len(x.strip()) > length for x in values):
        fail(f"{label}格式或长度不正确")
    return list(dict.fromkeys(x.strip() for x in values))


def profile_data(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        fail("饮食偏好格式不正确")
    enums = {
        "goal": ["营养均衡", "清淡减脂", "生酮饮食", "控糖少甜", "随心所欲", "无所谓"],
        "spiceLevel": [None, "完全不吃辣", "微辣", "中辣", "辣"],
        "budgetRange": list(BUDGETS),
        "appetite": ["吃得较少", "一般水平", "饭量偏大"],
    }
    defaults = {"goal": "营养均衡", "spiceLevel": None, "budgetRange": "20to30", "appetite": "一般水平"}
    result = {}
    for key, choices in enums.items():
        val = value.get(key, defaults[key])
        if val not in choices:
            fail("饮食偏好选项不正确")
        result[key] = val
    result.update(tastes=strings(value.get("tastes", []), 3, 16, "口味"), restrictions=strings(value.get("restrictions", []), 30, 32, "忌口"))
    if any(x not in ["重口", "清淡", "偏甜"] for x in result["tastes"]):
        fail("口味选项不正确")
    result.update(budget=BUDGETS[result["budgetRange"]], onboardingCompleted=True, schemaVersion=2)
    return result


class UserSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nickname: str = Field(default="", max_length=24)
    userId: str = Field(default="", max_length=32)
    photoInputEnabled: StrictBool = True
    voiceInputEnabled: StrictBool = True


def normalize_record(data, existing=None, allow_undated=False):
    if not isinstance(data, dict):
        fail("餐食内容格式不正确")
    names = data.get("dishes")
    if names is None:
        names = re.split(r"[、，,；;\n]+", str(data.get("dish_name") or data.get("dish") or ""))
    names = strings(names, 8, 50, "菜名")
    if not names or len("、".join(names)) > 240:
        fail("请填写菜品名称，最多 8 道菜，每道不超过 50 字")
    tags = strings(data.get("tags", []), 12, 16, "标签")
    remarks = data.get("remarks", "")
    if not isinstance(remarks, str) or len(remarks) > 1200:
        fail("备注请控制在 1200 字以内")
    raw_date = data.get("eatenAt") or data.get("loggedAt")
    stamp = None
    if raw_date:
        try:
            date = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            if not date.tzinfo or date.year < 1900:
                raise ValueError()
            stamp = date.timestamp()
            if stamp > datetime.now(timezone.utc).timestamp() + 60:
                raise ValueError()
        except (ValueError, AttributeError, TypeError, OverflowError):
            fail("用餐时间不正确，不能晚于现在")
    elif not allow_undated:
        fail("请填写完整的用餐日期和时间")
    tz = data.get("timeZone", "Asia/Shanghai")
    local = datetime.fromtimestamp(stamp, zone(tz)) if stamp is not None else None
    if local:
        hour = local.hour
        period = "早餐" if 6 <= hour < 10 else "午餐" if 10 <= hour < 15 else "下午茶" if 15 <= hour < 17 else "晚餐" if 17 <= hour < 22 else "夜宵"
    else:
        period = data.get("period") if data.get("period") in ["早餐", "午餐", "下午茶", "晚餐", "夜宵"] else None
    photos = data.get("photos", [])
    if not isinstance(photos, list) or len(photos) > 4 or any(not isinstance(p, dict) or not p.get("id") for p in photos):
        fail("每顿最多添加 4 张有效照片")
    if len({p["id"] for p in photos}) != len(photos):
        fail("照片不可重复")
    text = data.get("text", "、".join(names))
    if not isinstance(text, str) or len(text) > 4000:
        fail("原始记录内容过长")
    result = {
        "schemaVersion": 3, "dishes": names, "dish": "、".join(names), "dish_name": names[0] if len(names) == 1 else None,
        "text": text, "tags": tags, "remarks": remarks.strip(), "photos": [{"id": uid(p["id"])} for p in photos],
        "eatenAt": iso(stamp) if stamp is not None else None, "loggedAt": iso(stamp) if stamp is not None else None,
        "timeZone": tz, "period": period, "inputMethod": "photo" if photos else "text", "source": "photo" if photos else "text",
    }
    for key in ["originalText", "originalSource", "shop", "category", "item_id"]:
        value = data.get(key, (existing or {}).get(key))
        if isinstance(value, str):
            result[key] = value[:4000 if key == "originalText" else 100]
    if isinstance(data.get("price"), (int, float)) and 0 <= data["price"] <= 10000:
        result["price"] = data["price"]
    return result, stamp


def statistics(records, tz="Asia/Shanghai"):
    local = zone(tz)
    days, dishes = set(), Counter()
    counts = [0] * len(AXES)
    tagged = 0
    for record in records:
        if record.get("eatenAt"):
            date = datetime.fromisoformat(record["eatenAt"].replace("Z", "+00:00"))
            days.add(date.astimezone(local).date().isoformat())
        dishes.update(set(record.get("dishes", [])))
        tags = set(record.get("tags", []))
        matched = [tag in tags for _, tag in AXES]
        counts = [n + int(m) for n, m in zip(counts, matched)]
        tagged += any(matched)
    total = len(records)
    return {"mealCount": total, "dayCount": len(days), "dishCounts": dict(dishes), "taste": {
        "mealCount": total, "taggedMealCount": tagged, "counts": counts, "rates": [n / total if total else 0 for n in counts],
    }}
