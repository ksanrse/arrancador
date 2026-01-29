use serde::{Deserialize, Serialize};
use serde_yaml::Value as YamlValue;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SqobaManifest {
    pub games: HashMap<String, SqobaGame>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SqobaGame {
    pub files: Option<HashMap<String, Vec<String>>>,
    pub registry: Option<Vec<String>>,
}

impl SqobaManifest {
    pub fn find_game_entry(&self, name: &str) -> Option<(String, SqobaGame)> {
        if let Some(entry) = self.games.get(name) {
            return Some((name.to_string(), entry.clone()));
        }

        let normalized = normalize_name(name);
        let mut best: Option<(String, f32)> = None;

        for (key, entry) in &self.games {
            let key_norm = normalize_name(key);
            if key_norm == normalized {
                return Some((key.clone(), entry.clone()));
            }

            let score = similarity_score(&normalized, &key_norm);
            if best.as_ref().map(|b| score > b.1).unwrap_or(true) {
                best = Some((key.clone(), score));
            }
        }

        if let Some((best_key, best_score)) = best {
            if best_score >= 0.6 {
                return self
                    .games
                    .get(&best_key)
                    .cloned()
                    .map(|entry| (best_key, entry));
            }
        }

        None
    }

    pub fn suggest_games(&self, name: &str, limit: usize) -> Vec<String> {
        let normalized = normalize_name(name);
        let mut scored: Vec<(String, f32)> = self
            .games
            .keys()
            .map(|key| {
                let score = similarity_score(&normalized, &normalize_name(key));
                (key.clone(), score)
            })
            .filter(|(_, score)| *score >= 0.4)
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().take(limit).map(|(k, _)| k).collect()
    }
}

const CACHE_FILE_NAME: &str = "sqoba_manifest.json";

#[allow(dead_code)]
pub fn load_manifest() -> Result<SqobaManifest, String> {
    let manifest = load_manifest_optional()?;
    manifest.ok_or_else(|| "SQOBA manifest not found in example data".to_string())
}

pub fn load_manifest_optional() -> Result<Option<SqobaManifest>, String> {
    let cache_path = default_cache_path();
    let example_root = PathBuf::from("example");
    load_manifest_optional_with_paths(&cache_path, &example_root)
}

#[allow(dead_code)]
pub fn load_manifest_with_paths(
    cache_path: &Path,
    example_root: &Path,
) -> Result<SqobaManifest, String> {
    load_manifest_optional_with_paths(cache_path, example_root)?
        .ok_or_else(|| "SQOBA manifest not found in example data".to_string())
}

pub fn load_manifest_optional_with_paths(
    cache_path: &Path,
    example_root: &Path,
) -> Result<Option<SqobaManifest>, String> {
    if let Some(manifest) = load_manifest_from_cache(cache_path) {
        return Ok(Some(manifest));
    }

    let manifest = load_manifest_from_example(example_root)?;
    if let Some(manifest) = &manifest {
        write_manifest_cache(cache_path, manifest)?;
    }
    Ok(manifest)
}

fn default_cache_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("arrancador")
        .join(CACHE_FILE_NAME)
}

fn load_manifest_from_cache(cache_path: &Path) -> Option<SqobaManifest> {
    if !cache_path.exists() {
        return None;
    }

    let file = File::open(cache_path).ok()?;
    let reader = std::io::BufReader::new(file);
    serde_json::from_reader(reader).ok()
}

fn write_manifest_cache(cache_path: &Path, manifest: &SqobaManifest) -> Result<(), String> {
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec(manifest).map_err(|e| e.to_string())?;
    fs::write(cache_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_manifest_from_example(example_root: &Path) -> Result<Option<SqobaManifest>, String> {
    if !example_root.exists() {
        return Ok(None);
    }

    let candidates = candidate_manifest_paths(example_root);
    for path in candidates {
        if let Ok(manifest) = build_manifest_from_file(&path) {
            return Ok(Some(manifest));
        }
    }

    Ok(None)
}

fn candidate_manifest_paths(example_root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let direct_candidates = vec![
        example_root.join("sqoba").join("manifest.json"),
        example_root.join("sqoba").join("manifest.yaml"),
        example_root.join("sqoba").join("manifest.yml"),
        example_root.join("sqoba_manifest.json"),
        example_root.join("sqoba_manifest.yaml"),
        example_root.join("sqoba_manifest.yml"),
        example_root
            .join("ludusavi-manifest")
            .join("data")
            .join("manifest.yaml"),
        example_root
            .join("ludusavi-manifest-master")
            .join("data")
            .join("manifest.yaml"),
        example_root.join("ludusavi").join("manifest.yaml"),
        example_root.join("ludusavi").join("manifest.yml"),
        example_root
            .join("ludusavi")
            .join("data")
            .join("manifest.yaml"),
        example_root.join("manifest.json"),
        example_root.join("manifest.yaml"),
        example_root.join("manifest.yml"),
    ];

    for path in direct_candidates {
        if path.exists() {
            out.push(path);
        }
    }

    if out.is_empty() {
        out.extend(find_manifest_files(example_root));
    }

    dedup_paths(out)
}

fn find_manifest_files(example_root: &Path) -> Vec<PathBuf> {
    let mut matches = Vec::new();
    for entry in WalkDir::new(example_root)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if matches_manifest_name(&name) {
            matches.push(entry.path().to_path_buf());
        }
    }

    matches
}

fn matches_manifest_name(name: &str) -> bool {
    matches!(
        name,
        "manifest.yaml"
            | "manifest.yml"
            | "manifest.json"
            | "sqoba_manifest.json"
            | "sqoba_manifest.yaml"
            | "sqoba_manifest.yml"
            | "sqoba-manifest.json"
            | "sqoba-manifest.yaml"
            | "sqoba-manifest.yml"
    )
}

fn build_manifest_from_file(path: &Path) -> Result<SqobaManifest, String> {
    let mut text = String::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;

    match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
        "json" => serde_json::from_str(&text).map_err(|e| e.to_string()),
        _ => manifest_from_yaml(&text),
    }
}

fn dedup_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for path in paths {
        if seen.insert(path.clone()) {
            out.push(path);
        }
    }
    out
}

fn manifest_from_yaml(text: &str) -> Result<SqobaManifest, String> {
    let root: YamlValue = serde_yaml::from_str(text).map_err(|e| e.to_string())?;
    let mapping = root
        .as_mapping()
        .ok_or_else(|| "Invalid manifest format".to_string())?;

    let mut games: HashMap<String, SqobaGame> = HashMap::new();

    for (game_name, game_val) in mapping {
        let name = match game_name.as_str() {
            Some(n) => n.to_string(),
            None => continue,
        };

        let mut files_map: HashMap<String, Vec<String>> = HashMap::new();
        if let Some(files) = game_val
            .as_mapping()
            .and_then(|m| m.get(YamlValue::from("files")))
            .and_then(|v| v.as_mapping())
        {
            for (path_key, meta_val) in files {
                let path = match path_key.as_str() {
                    Some(p) => p.to_string(),
                    None => continue,
                };
                if !is_path_applicable(meta_val) {
                    continue;
                }
                let tags = extract_tags(meta_val);
                for tag in tags {
                    files_map.entry(tag).or_default().push(path.clone());
                }
            }
        }

        let game_manifest = SqobaGame {
            files: if files_map.is_empty() {
                None
            } else {
                Some(files_map)
            },
            registry: None,
        };
        games.insert(name, game_manifest);
    }

    Ok(SqobaManifest { games })
}

fn extract_tags(meta: &YamlValue) -> Vec<String> {
    if let Some(tags) = meta
        .as_mapping()
        .and_then(|m| m.get(YamlValue::from("tags")))
        .and_then(|v| v.as_sequence())
    {
        let mut out = Vec::new();
        for t in tags {
            if let Some(s) = t.as_str() {
                out.push(s.to_string());
            }
        }
        if !out.is_empty() {
            return out;
        }
    }
    vec!["save".to_string()]
}

fn is_path_applicable(meta: &YamlValue) -> bool {
    let when = meta
        .as_mapping()
        .and_then(|m| m.get(YamlValue::from("when")))
        .and_then(|v| v.as_sequence());
    if when.is_none() {
        return true;
    }

    for cond in when.unwrap() {
        if let Some(map) = cond.as_mapping() {
            if let Some(os_val) = map.get(YamlValue::from("os")).and_then(|v| v.as_str()) {
                let os = os_val.to_lowercase();
                if os == "windows" || os == "win" {
                    return true;
                } else {
                    continue;
                }
            } else {
                return true;
            }
        }
    }
    false
}

pub fn normalize_name(name: &str) -> String {
    let lower = name.to_lowercase();
    let re = regex::Regex::new(r"[^a-z0-9]+").unwrap();
    let cleaned = re.replace_all(&lower, " ");
    let stop_words = [
        "the",
        "a",
        "an",
        "edition",
        "definitive",
        "remastered",
        "goty",
        "game",
        "of",
        "year",
        "ultimate",
        "complete",
        "collection",
        "bundle",
        "deluxe",
        "enhanced",
        "hd",
    ];
    let tokens: Vec<&str> = cleaned
        .split_whitespace()
        .filter(|t| !stop_words.contains(t))
        .collect();
    tokens.join(" ")
}

pub fn similarity_score(a: &str, b: &str) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    if a.contains(b) || b.contains(a) {
        return 0.9;
    }
    let set_a: HashSet<&str> = a.split_whitespace().collect();
    let set_b: HashSet<&str> = b.split_whitespace().collect();
    if set_a.is_empty() || set_b.is_empty() {
        return 0.0;
    }
    let inter = set_a.intersection(&set_b).count() as f32;
    let union = set_a.union(&set_b).count() as f32;
    inter / union
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn load_manifest_prefers_cache_when_present() {
        let dir = tempdir().expect("tempdir");
        let cache_path = dir.path().join("cache.json");
        let example_root = dir.path().join("example");

        let mut games = HashMap::new();
        games.insert(
            "Cached Game".to_string(),
            SqobaGame {
                files: None,
                registry: None,
            },
        );
        let manifest = SqobaManifest { games };
        let json = serde_json::to_string(&manifest).expect("serialize manifest");
        fs::write(&cache_path, json).expect("write cache");

        let loaded = load_manifest_optional_with_paths(&cache_path, &example_root)
            .expect("load manifest")
            .expect("manifest present");

        assert!(loaded.games.contains_key("Cached Game"));
    }

    #[test]
    fn load_manifest_from_example_writes_cache() {
        let dir = tempdir().expect("tempdir");
        let cache_path = dir.path().join("cache.json");
        let example_root = dir.path().join("example");
        let example_sqoba = example_root.join("sqoba");
        fs::create_dir_all(&example_sqoba).expect("create example dirs");

        let mut games = HashMap::new();
        games.insert(
            "Example Game".to_string(),
            SqobaGame {
                files: None,
                registry: None,
            },
        );
        let manifest = SqobaManifest { games };
        let json = serde_json::to_string(&manifest).expect("serialize manifest");
        fs::write(example_sqoba.join("manifest.json"), json).expect("write manifest");

        let loaded = load_manifest_optional_with_paths(&cache_path, &example_root)
            .expect("load manifest")
            .expect("manifest present");

        assert!(loaded.games.contains_key("Example Game"));
        assert!(cache_path.exists());
    }

    #[test]
    fn find_game_entry_matches_normalized_name() {
        let mut games = HashMap::new();
        games.insert(
            "The Witcher 3: Game of the Year Edition".to_string(),
            SqobaGame {
                files: None,
                registry: None,
            },
        );
        let manifest = SqobaManifest { games };

        let found = manifest
            .find_game_entry("witcher 3")
            .expect("find game");
        assert_eq!(found.0, "The Witcher 3: Game of the Year Edition");
    }
}
