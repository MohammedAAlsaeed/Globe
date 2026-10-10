<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('maps:purge-trashed')->daily();
