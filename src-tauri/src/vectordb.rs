use hnsw_rs::hnsw::Hnsw;
use hnsw_rs::hnswio::{HnswIo, ReloadOptions};
use hnsw_rs::prelude::*;
use serde::{Deserialize, Serialize};

use std::fs;
use std::path::{Path, PathBuf};

// Import PathResolver trait for Tauri v2
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Vector {
    pub id: u32,
    pub vector: Vec<f32>,
}

impl Vector {
    pub fn new(id: u32, vector: Vec<f32>) -> Self {
        Self { id, vector }
    }
}
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: u32,
    pub distance: f32,
}

impl SearchResult {
    pub fn new(id: u32, distance: f32) -> Self {
        Self { id, distance }
    }
}
pub struct VectorStore {
    pub dim: usize,
    directory: PathBuf,
    basename: String,
    ef_search: usize,
}

impl VectorStore {
    pub fn new(app: &tauri::AppHandle, dim: usize, basename: &str) -> anyhow::Result<Self> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data directory: {:?}", e))?;

        // Ensure directory exists
        fs::create_dir_all(&app_data_dir)?;

        Ok(Self {
            dim,
            directory: app_data_dir,
            basename: basename.to_string(),
            ef_search: 50, // Default ef_search parameter
        })
    }

    /// Get the full path to the data file (for checking existence)
    fn data_file_path(&self) -> PathBuf {
        self.directory.join(format!("{}.hnsw.data", self.basename))
    }

    /// Helper function to create a new empty HNSW index
    fn create_new_index<'a>() -> Hnsw<'a, f32, DistL2> {
        let max_elements = 1_000_000;
        let max_nb_connection = 16;
        let max_layer = 16;
        let ef_construction = 200;
        Hnsw::new(
            max_nb_connection,
            max_elements,
            max_layer,
            ef_construction,
            DistL2 {},
        )
    }

    /// Execute a closure with a loaded (or freshly created) HNSW index, keeping the reloader alive.
    fn with_hnsw_mut<F, R>(
        directory: &Path,
        basename: &str,
        mmap: bool,
        mut f: F,
    ) -> anyhow::Result<R>
    where
        F: FnMut(&mut Hnsw<f32, DistL2>) -> anyhow::Result<R>,
    {
        // Ensure directory exists
        fs::create_dir_all(&directory)?;
        if Self::data_file_exists(directory, basename) {
            let mut reloader = HnswIo::new(directory, basename);
            let options = ReloadOptions::default().set_mmap(mmap);
            reloader.set_options(options);
            let mut hnsw = reloader
                .load_hnsw::<f32, DistL2>()
                .map_err(|e| anyhow::anyhow!("Failed to load HNSW index: {}", e))?;
            f(&mut hnsw)
        } else {
            let mut hnsw = Self::create_new_index();
            f(&mut hnsw)
        }
    }
    /// Add a new vector to the store.  
    /// id must be unique — you manage this externally.
    pub fn add_vectors(&mut self, vectors: Vec<Vector>) -> anyhow::Result<()> {
        if vectors.iter().any(|v| v.vector.len() != self.dim) {
            anyhow::bail!("Vector has wrong dimension: expected {}", self.dim,);
        }

        // Extract directory and basename to avoid borrow checker issues
        let directory = self.directory.clone();
        let basename = self.basename.clone();

        Self::with_hnsw_mut(&directory, &basename, true, |hnsw| {
            // Insert the vectors
            for vector in &vectors {
                hnsw.insert((&vector.vector, vector.id as usize));
            }

            // Save the index (this should work even if Hnsw borrows from reloader)
            // Dump always writes a new serialized copy, so mmapped data is safely refreshed.
            hnsw.file_dump(&directory, &basename)
                .map_err(|e| anyhow::anyhow!("Failed to save HNSW index: {}", e))
        })?;

        Ok(())
    }

    /// Helper to check if data file exists
    fn data_file_exists(directory: &Path, basename: &str) -> bool {
        directory.join(format!("{}.hnsw.data", basename)).exists()
    }

    /// Search the top-k nearest vectors
    pub fn search(&self, query: Vec<f32>, k: usize) -> anyhow::Result<Vec<SearchResult>> {
        if query.len() != self.dim {
            anyhow::bail!(
                "Query vector has wrong dimension: expected {}, got {}",
                self.dim,
                query.len()
            );
        }

        // Extract directory and basename to avoid borrow checker issues
        let directory = self.directory.clone();
        let basename = self.basename.clone();
        let ef_search = self.ef_search;

        // Load or create the index and perform search while the reloader stays alive.
        let neighbours = Self::with_hnsw_mut(&directory, &basename, true, |hnsw| {
            Ok(hnsw.search(&query, k, ef_search))
        })?;

        // Convert Vec<Neighbour> to Vec<(u32, f32)>
        let results = neighbours
            .into_iter()
            .map(|n| SearchResult::new(n.d_id as u32, n.distance))
            .collect::<Vec<_>>();

        Ok(results)
    }

    /// Set the ef_search parameter (default is 64)
    pub fn set_ef_search(&mut self, ef_search: usize) {
        self.ef_search = ef_search;
    }
}
