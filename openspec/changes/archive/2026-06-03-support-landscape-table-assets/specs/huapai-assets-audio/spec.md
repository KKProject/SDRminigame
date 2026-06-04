## MODIFIED Requirements

### Requirement: Asset Manifest
The system SHALL load visual assets through a manifest that maps semantic names such as table background, card back, card front, action button, and result panel to local `images/` paths, and the default table background SHALL be mapped to `images/background.jpg`.

#### Scenario: Manifest asset exists
- **WHEN** a mapped image path loads successfully
- **THEN** the renderer MUST use that image for the corresponding table element

#### Scenario: Manifest asset is missing
- **WHEN** a mapped image path is absent or fails to load
- **THEN** the renderer MUST draw a canvas fallback for that element without blocking gameplay

#### Scenario: Default background image exists
- **WHEN** `images/background.jpg` loads successfully
- **THEN** the renderer MUST use it as the table background

### Requirement: Audio Cues
The system SHALL play local audio cues for key events when configured, including discard, meld, win, draw result, button tap, and looping background music, and the default background music SHALL be loaded from `audio/bgmusic.mp3`.

#### Scenario: Audio is disabled or unavailable
- **WHEN** an audio file fails to load or playback is unavailable
- **THEN** the system MUST continue gameplay silently without throwing runtime errors

#### Scenario: Default background music exists
- **WHEN** `audio/bgmusic.mp3` is available and audio is not muted
- **THEN** the music manager MUST use it as the looping background music track
