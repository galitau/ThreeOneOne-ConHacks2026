from sklearn.cluster import DBSCAN
import numpy as np

def cluster_reports(reports):
    coords = np.array([[r["lat"], r["lng"]] for r in reports])

    clustering = DBSCAN(eps=0.003, min_samples=2).fit(coords)
    labels = clustering.labels_

    clusters = {}
    for idx, label in enumerate(labels):
        if label == -1:
            continue
        clusters.setdefault(label, []).append(reports[idx])

    return list(clusters.values())