def compute_confidence(report_count, has_image, multi_source, recency_score):
    score = 0

    score += min(report_count * 0.2, 0.4)
    score += 0.2 if has_image else 0
    score += 0.2 if multi_source else 0
    score += recency_score  # 0 → 0.2

    return min(score, 1.0)


def confidence_level(score):
    if score < 0.4:
        return "low"
    elif score < 0.7:
        return "medium"
    return "high"