use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    pub name: String,
    pub css: String,
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default)]
    pub font_weight: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontFace {
    pub family: String,
    pub src: String,
    #[serde(default)]
    pub weight: Option<u16>,
    #[serde(default)]
    pub style: Option<String>,
}

#[derive(Default)]
pub struct ThemeRegistry {
    pub themes: HashMap<String, ThemeData>,
    pub global_fonts: Vec<FontFace>,
}

#[derive(Debug, Clone)]
pub struct ThemeData {
    pub css: String,
    pub font_family: Option<String>,
    pub font_weight: Option<u16>,
}

impl ThemeRegistry {
    pub fn new() -> Self {
        Self {
            themes: HashMap::new(),
            global_fonts: Vec::new(),
        }
    }

    pub fn list(&self) -> Vec<Theme> {
        self.themes
            .iter()
            .map(|(k, v)| Theme {
                name: k.clone(),
                css: v.css.clone(),
                font_family: v.font_family.clone(),
                font_weight: v.font_weight,
            })
            .collect()
    }

    pub fn register(&mut self, name: String, css: String) {
        self.themes.insert(
            name.clone(),
            ThemeData {
                css,
                font_family: None,
                font_weight: None,
            },
        );
    }

    pub fn register_with_font(
        &mut self,
        name: String,
        css: String,
        font_family: Option<String>,
        font_weight: Option<u16>,
    ) {
        self.themes.insert(
            name,
            ThemeData {
                css,
                font_family,
                font_weight,
            },
        );
    }

    pub fn get_css(&self, name: &str) -> Option<String> {
        self.themes.get(name).map(|t| t.css.clone())
    }

    pub fn get_theme_data(&self, name: &str) -> Option<&ThemeData> {
        self.themes.get(name)
    }

    pub fn register_font(&mut self, font: FontFace) {
        self.global_fonts.push(font);
    }

    pub fn get_font_css(&self) -> String {
        self.global_fonts
            .iter()
            .map(|f| {
                let mut css = format!("@font-face {{ font-family: '{}'; src: {};", f.family, f.src);
                if let Some(w) = f.weight {
                    css.push_str(&format!(" font-weight: {};", w));
                }
                if let Some(s) = &f.style {
                    css.push_str(&format!(" font-style: {};", s));
                }
                css.push_str(" }");
                css
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}
