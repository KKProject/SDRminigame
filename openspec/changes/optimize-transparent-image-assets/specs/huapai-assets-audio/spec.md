## MODIFIED Requirements

### Requirement: Asset Manifest
The system SHALL load visual assets through a manifest that maps semantic names such as table background, card back, card front, action button, result panel, and card atlas metadata to local project paths. The default table background SHALL be mapped to `images/background.jpg`, and the default card atlas image SHALL be mapped to `images/element.png`. PNG optimization MUST preserve these semantic paths, image dimensions, alpha rendering, and atlas coordinate compatibility.

#### Scenario: Manifest asset exists
- **WHEN** a mapped image path loads successfully
- **THEN** the renderer MUST use that image for the corresponding table element

#### Scenario: Manifest asset is missing
- **WHEN** a mapped image path is absent or fails to load
- **THEN** the renderer MUST draw a canvas fallback for that element without blocking gameplay

#### Scenario: Default background image exists
- **WHEN** `images/background.jpg` loads successfully
- **THEN** the renderer MUST use it as the table background

#### Scenario: Card atlas metadata exists
- **WHEN** the bundled atlas JSON for `images/element.png` is available
- **THEN** the asset loader MUST expose named frame metadata including frame coordinates, source size, rotation flag, category, confidence, label, and nested atlas size group where provided

#### Scenario: Nested card atlas groups exist
- **WHEN** the bundled atlas JSON contains `frames.big`, `frames.small`, or `frames.mini`
- **THEN** the asset loader MUST read card frames from those nested groups and associate each frame with its containing size group

#### Scenario: Card atlas metadata is missing
- **WHEN** the atlas JSON is absent, invalid, or lacks a requested frame
- **THEN** the renderer MUST continue using the existing canvas card fallback without throwing runtime errors

#### Scenario: Manifest PNG is optimized
- **WHEN** a PNG referenced by the asset manifest is replaced by an optimized encoding
- **THEN** its manifest path and decoded visual pixels MUST remain unchanged
- **AND** atlas-backed images MUST remain compatible with their existing frame coordinates
