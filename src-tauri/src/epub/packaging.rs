use crate::epub::xmlutils::XMLNode;

#[derive(Debug, Clone)]
pub struct Binding {
    pub media_type: String,
    pub handler: String,
}

#[derive(Debug, Clone)]
pub struct CollectionLink {
    pub href: Option<String>,
    pub rel: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Collection {
    pub role: Option<String>,
    pub links: Vec<CollectionLink>,
}

#[derive(Debug, Clone, Default)]
pub struct PackagingExtras {
    pub page_progression_direction: Option<String>,
    pub rendition_layout: Option<String>,
    pub rendition_flow: Option<String>,
    pub rendition_orientation: Option<String>,
    pub rendition_spread: Option<String>,
    pub bindings: Vec<Binding>,
    pub collections: Vec<Collection>,
}

pub fn parse_packaging_extras(root: &XMLNode) -> PackagingExtras {
    // OPF root → <spine page-progression-direction="ltr|rtl|default">
    let mut extras = PackagingExtras::default();
    if let Some(spine_ref) = root.find("spine") {
        let spine = spine_ref.borrow();
        if let Some(ppd) = spine.get_attr("page-progression-direction") {
            extras.page_progression_direction = Some(ppd);
        }
    }

    // rendition:* metadata under <metadata><meta property="rendition:*">value</meta>
    if let Some(metadata_ref) = root.find("metadata") {
        for child in &metadata_ref.borrow().children {
            let item = child.borrow();
            if item.name.local_name == "meta" {
                if let Some(prop) = item.get_attr("property") {
                    match prop.as_str() {
                        "rendition:layout" => extras.rendition_layout = item.text.clone(),
                        "rendition:flow" => extras.rendition_flow = item.text.clone(),
                        "rendition:orientation" => extras.rendition_orientation = item.text.clone(),
                        "rendition:spread" => extras.rendition_spread = item.text.clone(),
                        _ => {}
                    }
                }
            }
        }
    }

    // EPUB3 bindings: <bindings><mediaType media-type="" handler=""/></bindings>
    if let Some(bindings_ref) = root.find("bindings") {
        for child in &bindings_ref.borrow().children {
            let item = child.borrow();
            if item.name.local_name == "mediaType" {
                if let (Some(mt), Some(h)) = (item.get_attr("media-type"), item.get_attr("handler"))
                {
                    extras.bindings.push(Binding {
                        media_type: mt,
                        handler: h,
                    });
                }
            }
        }
    }

    // Collections: <collection role="..."> <link href rel> ...
    // Collect role and child links (href, rel)
    // Note: multiple nested collections are not deeply traversed here.
    for child in &root.children {
        let node = child.borrow();
        if node.name.local_name == "collection" {
            let role = node.get_attr("role");
            let mut links: Vec<CollectionLink> = Vec::new();
            for l in &node.children {
                let link = l.borrow();
                if link.name.local_name == "link" {
                    links.push(CollectionLink {
                        href: link.get_attr("href"),
                        rel: link.get_attr("rel"),
                    });
                }
            }
            extras.collections.push(Collection { role, links });
        }
    }
    extras
}
