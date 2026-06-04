## MODIFIED Requirements

### Requirement: Card Face Rendering
The system SHALL render every configured card face with readable symbol text, color, and special-card indicators whether or not card-face images exist. The system SHALL scan `images/element.png` atlas frames in order, use frame `label` text to collect the first 24 distinct card-character frames, render matched card faces by cropping the atlas image from those named frames, and preserve the card artwork aspect ratio when drawing visible card faces.

#### Scenario: Card atlas face is available
- **WHEN** one of the first 24 distinct card-character atlas frames has a `label` containing the card's configured Chinese character
- **THEN** the renderer MUST draw the corresponding cropped region from `images/element.png` into card bounds that preserve the configured card aspect ratio

#### Scenario: Horizontal card atlas face is available
- **WHEN** a matched atlas frame is labeled as horizontal or is wider than tall
- **THEN** the renderer MUST draw that frame rotated clockwise by 90 degrees into aspect-correct card bounds

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

#### Scenario: Fallback card face is drawn
- **WHEN** a canvas-rendered fallback card is used for a hand card
- **THEN** the fallback card bounds MUST use the same aspect ratio as atlas-rendered hand cards
