<?php

namespace App\Enums;

enum AssetKind: string
{
    case Stamps = 'stamps';
    case Textures = 'textures';
    /** Line Tool art: pieces repeated along a line (category = the piece's role). */
    case Lines = 'lines';
}
