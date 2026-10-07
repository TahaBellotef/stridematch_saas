#
#  File: utils/dynamo.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT - Copyright (C) 2025. macitch.
#


from __future__ import annotations
from decimal import Decimal
from math import isnan, isinf
from typing import Any


def from_dynamo(value: Any) -> Any:
    """
    Convert DynamoDB-typed values to native Python types:
      - Decimal → int or float
      - list, dict → recursively converted
      - everything else unchanged
    """
    if isinstance(value, Decimal):
        # If number is whole → int, else → float.
        return int(value) if value % 1 == 0 else float(value)

    if isinstance(value, list):
        return [from_dynamo(v) for v in value]

    if isinstance(value, dict):
        return {k: from_dynamo(v) for k, v in value.items()}

    return value


def to_dynamo(value: Any) -> Any:
    """
    Convert Python-native values → DynamoDB-safe values:
      - float → Decimal(...) unless NaN or inf (converted to None)
      - int → Decimal(int)
      - list, dict → recursively converted
      - bool, None, str → unchanged
    """

    # DynamoDB forbids these as Number types
    if isinstance(value, float):
        if isnan(value) or isinf(value):
            return None
        return Decimal(str(value))

    if isinstance(value, int):
        return Decimal(value)

    if isinstance(value, dict):
        # Skip None values; DynamoDB cannot store them inside maps
        return {k: to_dynamo(v) for k, v in value.items() if v is not None}

    if isinstance(value, list):
        return [to_dynamo(v) for v in value]

    # bool, None, str, etc. stay as-is
    return value