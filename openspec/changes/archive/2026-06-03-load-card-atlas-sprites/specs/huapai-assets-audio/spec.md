## MODIFIED Requirements

### Requirement: Asset Manifest
The system SHALL load visual assets through a manifest that maps semantic names such as table background, card back, card front, action button, result panel, and card atlas metadata to local project paths. The default table background SHALL be mapped to `images/background.jpg`, and the default card atlas image SHALL be mapped to `images/element.png`.

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
- **THEN** the asset loader MUST expose named frame metadata including frame coordinates, source size, rotation flag, category, confidence, and label where provided

#### Scenario: Card atlas metadata is missing
- **WHEN** the atlas JSON is absent, invalid, or lacks a requested frame
- **THEN** the renderer MUST continue using the existing canvas card fallback without throwing runtime errors

### Requirement: Card Face Rendering
The system SHALL render every configured card face with readable symbol text, color, and special-card indicators whether or not card-face images exist. The system SHALL scan `images/element.png` atlas frames in order, use frame `label` text to collect the first 24 distinct card-character frames, and render matched card faces by cropping the atlas image from those named frames.

#### Scenario: Card atlas face is available
- **WHEN** one of the first 24 distinct card-character atlas frames has a `label` containing the card's configured Chinese character
- **THEN** the renderer MUST draw the corresponding cropped region from `images/element.png` into the card bounds

#### Scenario: Horizontal card atlas face is available
- **WHEN** a matched atlas frame is labeled as horizontal or is wider than tall
- **THEN** the renderer MUST draw that frame rotated clockwise by 90 degrees into the card bounds

#### Scenario: Early non-card atlas frame is available
- **WHEN** an early atlas frame label does not contain a configured card character
- **THEN** the system MUST skip that frame and continue scanning until 24 distinct card-character frames are collected or no frames remain

#### Scenario: Card back atlas is available
- **WHEN** a hidden opponent card or card back is rendered and `tile_back_green_vertical` or a configured back frame exists
- **THEN** the renderer MUST draw the corresponding cropped card-back region from `images/element.png`

#### Scenario: No card atlas is available
- **WHEN** the card-face atlas is not configured
- **THEN** every card in the player hand, melds, and discard piles MUST still be identifiable from canvas-rendered text

#### Scenario: Specific card frame is missing
- **WHEN** the atlas exists but a configured card symbol cannot be matched to a usable frame in the first 24 distinct card-character entries
- **THEN** that card MUST fall back to canvas-rendered text while other cards with valid frames continue using atlas sprites
