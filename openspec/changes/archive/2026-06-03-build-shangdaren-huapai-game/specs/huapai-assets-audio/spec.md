## ADDED Requirements

### Requirement: Asset Manifest
The system SHALL load visual assets through a manifest that maps semantic names such as table background, card back, card front, action button, and result panel to local `images/` paths.

#### Scenario: Manifest asset exists
- **WHEN** a mapped image path loads successfully
- **THEN** the renderer MUST use that image for the corresponding table element

#### Scenario: Manifest asset is missing
- **WHEN** a mapped image path is absent or fails to load
- **THEN** the renderer MUST draw a canvas fallback for that element without blocking gameplay

### Requirement: Card Face Rendering
The system SHALL render every configured card face with readable symbol text, color, and special-card indicators whether or not card-face images exist.

#### Scenario: No card atlas is available
- **WHEN** the card-face atlas is not configured
- **THEN** every card in the player hand, melds, and discard piles MUST still be identifiable from canvas-rendered text

### Requirement: Audio Cues
The system SHALL play local audio cues for key events when configured, including discard, meld, win, draw result, button tap, and background music.

#### Scenario: Audio is disabled or unavailable
- **WHEN** an audio file fails to load or playback is unavailable
- **THEN** the system MUST continue gameplay silently without throwing runtime errors

### Requirement: Audio Controls
The system SHALL expose an in-game mute state that applies to background music and sound effects.

#### Scenario: Player toggles mute
- **WHEN** the player taps the mute control
- **THEN** the system MUST update the mute state and stop or resume future audio playback accordingly
