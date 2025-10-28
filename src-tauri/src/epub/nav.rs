use crate::epub::xmlutils::{XMLError, XMLNode, XMLReader};
use serde::Serialize;
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug, Clone, Serialize)]
pub struct NavItem {
    pub label: String,
    pub href: String,
    pub children: Vec<NavItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NavData {
    pub toc: Vec<NavItem>,
    pub page_list: Vec<NavItem>,
    pub landmarks: Vec<NavItem>,
}

const EPUB_NS_OPS: &str = "http://www.idpf.org/2007/ops"; // namespace used for epub:type

fn get_attr_ns(node: &XMLNode, local: &str, ns: &str) -> Option<String> {
    node.attrs
        .iter()
        .find(|a| {
            if a.name.local_name != local {
                return false;
            }
            match &a.name.namespace {
                Some(u) => u == ns,
                None => false,
            }
        })
        .map(|a| a.value.clone())
}

fn collect_nav_items(list_node: &XMLNode) -> Vec<NavItem> {
    // Expect <ol><li><a href>label</a> [<ol>children]</ol></li></ol>
    let mut items: Vec<NavItem> = Vec::new();

    for child_ref in &list_node.children {
        let li = child_ref.borrow();
        if li.name.local_name != "li" {
            continue;
        }

        // Find first <a>
        let mut label: String = String::new();
        let mut href: String = String::new();
        let mut nested: Vec<NavItem> = Vec::new();

        for li_child_ref in &li.children {
            let li_child = li_child_ref.borrow();
            if li_child.name.local_name == "a" {
                if let Some(h) = li_child.get_attr("href") {
                    href = h;
                }
                // text content may be nested in <span> etc.; try direct text then any descendant text
                if let Some(t) = li_child.text.clone() {
                    label = t;
                } else {
                    // try a descendant child text
                    if let Some(span_ref) = li_child.find("span") {
                        if let Some(t) = span_ref.borrow().text.clone() {
                            label = t;
                        }
                    }
                }
            } else if li_child.name.local_name == "ol" {
                // nested list
                nested = collect_nav_items(&li_child);
            }
        }

        if !href.is_empty() {
            items.push(NavItem {
                label,
                href,
                children: nested,
            });
        }
    }

    items
}

fn find_nav_of_type(root: &XMLNode, nav_type: &str) -> Option<Rc<RefCell<XMLNode>>> {
    // Find <nav epub:type="nav_type"> …
    for child_ref in &root.children {
        let child = child_ref.borrow();
        if child.name.local_name == "nav" {
            if let Some(t) = get_attr_ns(&child, "type", EPUB_NS_OPS) {
                if t.split_whitespace()
                    .any(|v| v.eq_ignore_ascii_case(nav_type))
                {
                    return Some(child_ref.clone());
                }
            }
        }
        if let Some(found) = find_nav_of_type(&child, nav_type) {
            return Some(found);
        }
    }
    None
}

pub fn parse_nav_document(bytes: &[u8]) -> Result<NavData, XMLError> {
    let root = XMLReader::parse(bytes)?;
    let root = root.into_inner();

    let toc_list = find_nav_of_type(&root, "toc")
        .and_then(|nref| nref.borrow().find("ol"))
        .map(|r| collect_nav_items(&r.borrow()))
        .unwrap_or_default();

    let page_list = find_nav_of_type(&root, "page-list")
        .and_then(|nref| nref.borrow().find("ol"))
        .map(|r| collect_nav_items(&r.borrow()))
        .unwrap_or_default();

    let landmarks = find_nav_of_type(&root, "landmarks")
        .and_then(|nref| nref.borrow().find("ol"))
        .map(|r| collect_nav_items(&r.borrow()))
        .unwrap_or_default();

    Ok(NavData {
        toc: toc_list,
        page_list,
        landmarks,
    })
}
