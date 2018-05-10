# About

Nodejs example that shows how to use Storyblok's management api to sync components from one space to another.
Useful to include it to your CI pipeline when you have a dev and a live environment.

# Installation

```
npm install
```

# How to use

1. Set the environment variable `STORYBLOK_OAUTH` to your Storyblok oauth token (We recommend to create a specific API user for this). You can manage personal access tokens under the my account section of Storyblok.
2. Replace YOUR_SOURCE_SPACE_ID and YOUR_TARGET_SPACE_ID
3. Execute `node index.js`