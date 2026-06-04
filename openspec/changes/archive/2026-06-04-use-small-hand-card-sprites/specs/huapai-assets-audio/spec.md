## MODIFIED Requirements

### Requirement: Card Face Rendering
The system SHALL render every configured card face with readable symbol text, color, and special-card indicators whether or not card-face images exist. The system SHALL scan `images/element.png` atlas frame names for configured card keys and size/orientation tokens, support nested `big`, `small`, and `mini` frame groups, render matched card faces by cropping the atlas image from those named frames, and preserve the card artwork aspect ratio when drawing visible card faces.

#### Scenario: Size-keyed card atlas face is available
- **WHEN** a nested atlas frame name contains a supported size token, a configured card key such as `ren`, and an orientation suffix
- **THEN** the asset loader MUST map that frame to the matching card key and size

#### Scenario: Big card atlas face is requested
- **WHEN** the renderer requests a normal non-hand card sprite for a card key
- **THEN** the asset loader MUST prefer the matching `big` atlas frame for that card key

#### Scenario: Human hand small card atlas face is requested
- **WHEN** the renderer draws a visible human hand card
- **THEN** the renderer MUST request the matching `small` atlas frame for that card key

#### Scenario: Small card atlas face is requested
- **WHEN** the renderer requests a compact table, discard, or meld sprite for a card key
- **THEN** the asset loader MUST prefer the matching `small` atlas frame for that card key

#### Scenario: Mini card atlas face is requested
- **WHEN** the renderer requests a mini sprite for a card key
- **THEN** the asset loader MUST prefer the matching `mini` atlas frame for that card key

#### Scenario: Horizontal-left card atlas face is available
- **WHEN** a matched atlas frame name uses the `hl` orientation suffix
- **THEN** the renderer MUST draw that frame rotated clockwise by 90 degrees into aspect-correct card bounds

#### Scenario: Horizontal-right card atlas face is available
- **WHEN** a matched atlas frame name uses the `hf` orientation suffix
- **THEN** the renderer MUST draw that frame rotated counterclockwise by 90 degrees into aspect-correct card bounds

#### Scenario: Vertical card atlas face is available
- **WHEN** a matched atlas frame name uses the `v` orientation suffix
- **THEN** the renderer MUST draw that frame without rotation into aspect-correct card bounds

#### Scenario: Requested size is missing
- **WHEN** the requested `big`, `small`, or `mini` frame is missing for a card key but another size exists for that card key
- **THEN** the asset loader MUST return an available fallback sprite for that card key before falling back to canvas text

#### Scenario: Legacy card atlas face is available
- **WHEN** the atlas does not provide usable size-keyed frame names but one of the first 24 distinct card-character atlas frames has a `label` containing the card's configured Chinese character
- **THEN** the renderer MUST draw the corresponding cropped region from `images/element.png` into card bounds that preserve the configured card aspect ratio

#### Scenario: Early non-card atlas frame is available
- **WHEN** an early atlas frame label or frame name does not identify a configured card character
- **THEN** the system MUST skip that frame and continue scanning usable card entries until all configured card-character frames are collected or no frames remain

#### Scenario: Card back atlas is available
- **WHEN** a hidden opponent card or card back is rendered and a configured back frame exists in a nested or flat atlas group
- **THEN** the renderer MUST draw the corresponding cropped card-back region from `images/element.png`

#### Scenario: No card atlas is available
- **WHEN** the card-face atlas is not configured
- **THEN** every card in the player hand, melds, and discard piles MUST still be identifiable from canvas-rendered text

#### Scenario: Specific card frame is missing
- **WHEN** the atlas exists but a configured card symbol cannot be matched to a usable frame by size-keyed name or legacy label matching
- **THEN** that card MUST fall back to canvas-rendered text while other cards with valid frames continue using atlas sprites

#### Scenario: Fallback card face is drawn
- **WHEN** a canvas-rendered fallback card is used for a hand card
- **THEN** the fallback card bounds MUST use the same aspect ratio as atlas-rendered hand cards
