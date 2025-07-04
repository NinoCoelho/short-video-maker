import path from "path";
import fs from "fs-extra";

import { type Music, MusicForVideo, MusicMoodEnum } from "../types/shorts";
import { Config } from "../config";

export class MusicManager {
  private static musicList: Music[] = [
    {
      file: "ModernWorship1.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship2.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship3.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship4.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship5.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship6.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship7.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship8.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship9.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    {
      file: "ModernWorship10.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    // {
    //   file: "Rise and Shine v1.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v3.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v4.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v5.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v6.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Soar v1.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Soar v2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 1.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 3.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 4.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Pra Te Adorar.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    {
      file: "O Amor Escolheu Me Amar Cinematic.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.inspirational,
    },
    // {
    //   file: "Tu Es Soberano Inspiring Instrumental.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "O Nome de Jesus Instrumental 2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "EPIC Nome Jesus 2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "EPIC Nome Jesus.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    {
      file: "Sly Sky - Telecasted.mp3",
      start: 0,
      end: 152,
      mood: MusicMoodEnum.melancholic,
    },
    {
      file: "No.2 Remembering Her - Esther Abrami.mp3",
      start: 2,
      end: 134,
      mood: MusicMoodEnum.melancholic,
    },
    {
      file: "Champion - Telecasted.mp3",
      start: 0,
      end: 142,
      mood: MusicMoodEnum.chill,
    },
    {
      file: "Oh Please - Telecasted.mp3",
      start: 0,
      end: 154,
      mood: MusicMoodEnum.chill,
    },
    {
      file: "Jetski - Telecasted.mp3",
      start: 0,
      end: 142,
      mood: MusicMoodEnum.uneasy,
    },
    {
      file: "Phantom - Density & Time.mp3",
      start: 0,
      end: 178,
      mood: MusicMoodEnum.uneasy,
    },
    {
      file: "On The Hunt - Andrew Langdon.mp3",
      start: 0,
      end: 95,
      mood: MusicMoodEnum.uneasy,
    },
    {
      file: "Name The Time And Place - Telecasted.mp3",
      start: 0,
      end: 142,
      mood: MusicMoodEnum.excited,
    },
    {
      file: "Delayed Baggage - Ryan Stasik.mp3",
      start: 3,
      end: 108,
      mood: MusicMoodEnum.euphoric,
    },
    {
      file: "Like It Loud - Dyalla.mp3",
      start: 4,
      end: 160,
      mood: MusicMoodEnum.euphoric,
    },
    {
      file: "Organic Guitar House - Dyalla.mp3",
      start: 2,
      end: 160,
      mood: MusicMoodEnum.euphoric,
    },
    {
      file: "Honey, I Dismembered The Kids - Ezra Lipp.mp3",
      start: 2,
      end: 144,
      mood: MusicMoodEnum.dark,
    },
    {
      file: "Night Hunt - Jimena Contreras.mp3",
      start: 0,
      end: 88,
      mood: MusicMoodEnum.dark,
    },
    {
      file: "Curse of the Witches - Jimena Contreras.mp3",
      start: 0,
      end: 102,
      mood: MusicMoodEnum.dark,
    },
    {
      file: "Restless Heart - Jimena Contreras.mp3",
      start: 0,
      end: 94,
      mood: MusicMoodEnum.sad,
    },
    {
      file: "Heartbeat Of The Wind - Asher Fulero.mp3",
      start: 0,
      end: 124,
      mood: MusicMoodEnum.sad,
    },
    {
      file: "Hopeless - Jimena Contreras.mp3",
      start: 0,
      end: 250,
      mood: MusicMoodEnum.sad,
    },
    {
      file: "Touch - Anno Domini Beats.mp3",
      start: 0,
      end: 165,
      mood: MusicMoodEnum.happy,
    },
    {
      file: "Cafecito por la Manana - Cumbia Deli.mp3",
      start: 0,
      end: 184,
      mood: MusicMoodEnum.happy,
    },
    {
      file: "Aurora on the Boulevard - National Sweetheart.mp3",
      start: 0,
      end: 130,
      mood: MusicMoodEnum.happy,
    },
    {
      file: "Buckle Up - Jeremy Korpas.mp3",
      start: 0,
      end: 128,
      mood: MusicMoodEnum.angry,
    },
    {
      file: "Twin Engines - Jeremy Korpas.mp3",
      start: 0,
      end: 120,
      mood: MusicMoodEnum.angry,
    },
    {
      file: "Hopeful - Nat Keefe.mp3",
      start: 0,
      end: 175,
      mood: MusicMoodEnum.hopeful,
    },
    {
      file: "Hopeful Freedom - Asher Fulero.mp3",
      start: 1,
      end: 172,
      mood: MusicMoodEnum.hopeful,
    },
    {
      file: "Crystaline - Quincas Moreira.mp3",
      start: 0,
      end: 140,
      mood: MusicMoodEnum.contemplative,
    },
    {
      file: "Final Soliloquy - Asher Fulero.mp3",
      start: 1,
      end: 178,
      mood: MusicMoodEnum.contemplative,
    },
    {
      file: "Seagull - Telecasted.mp3",
      start: 0,
      end: 123,
      mood: MusicMoodEnum.funny,
    },
    {
      file: "Banjo Doops - Joel Cummins.mp3",
      start: 0,
      end: 98,
      mood: MusicMoodEnum.funny,
    },
    {
      file: "Baby Animals Playing - Joel Cummins.mp3",
      start: 0,
      end: 124,
      mood: MusicMoodEnum.funny,
    },
    {
      file: "Sinister - Anno Domini Beats.mp3",
      start: 0,
      end: 215,
      mood: MusicMoodEnum.dark,
    },
    {
      file: "Traversing - Godmode.mp3",
      start: 0,
      end: 95,
      mood: MusicMoodEnum.dark,
    },
    {
      file: "WorshipRehearsal1.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    {
      file: "WorshipRehearsal2.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    {
      file: "WorshipRehearsal3.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    {
      file: "VemMeTocar.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    {
      file: "Vem Me Tocar.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    {
      file: "Vem Me Tocar v2.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    {
      file: "Pra Te Dizer v1.mp3",
      start: 0,
      end: 180,
      mood: MusicMoodEnum.worship,
    },
    
  ];

  constructor(private config: Config) {}
  public musicList(): MusicForVideo[] {
    return MusicManager.musicList.map((music: Music) => ({
      ...music,
      url: this.getMusicUrl(music.file),
    }));
  }

  /**
   * Get music URL using port-agnostic resolution
   */
  private getMusicUrl(filename: string): string {
    // For music URLs, we need absolute URLs for Remotion context
    return `http://localhost:${this.config.port}/api/music/${encodeURIComponent(filename)}`;
  }
  private musicFileExist(music: Music): boolean {
    return fs.existsSync(path.join(this.config.musicDirPath, music.file));
  }
  public ensureMusicFilesExist(): void {
    for (const music of this.musicList()) {
      if (!this.musicFileExist(music)) {
        throw new Error(`Music file not found: ${music.file}`);
      }
    }
  }
}
