const StoryblokClient = require('storyblok-js-client')
const fs = require('fs')
const throttledQueue = require('throttled-queue')

const Storyblok = new StoryblokClient({
  headers: {
    'Authorization': process.env.STORYBLOK_OAUTH
  }
})

const sourceSpaceId = 'YOUR_SOURCE_SPACE_ID'
const targetSpaceId = 'YOUR_TARGET_SPACE_ID'
const throttle = throttledQueue(5, 1000)

const Sync = {
  targetComponents: [],
  sourceComponents: [],
  componentsCount: 0,
  componentsSynced: 0,

  async init() {
    this.targetComponents = await Storyblok.client.get(`spaces/${targetSpaceId}/components`)
    this.sourceComponents = await Storyblok.client.get(`spaces/${sourceSpaceId}/components`)

    fs.writeFileSync('./components.json', JSON.stringify(this.sourceComponents.data, null, 2))

    this.componentsCount = this.sourceComponents.data.components.length
    this.sourceComponents.data.components.forEach((component) => {
      delete component.id
      delete component.created_at

      throttle(() => {
        // Create new component on target space
        Storyblok.client.post(`spaces/${targetSpaceId}/components`, {
            component: component
          })
          .then(this.syncedCb.bind(this))
          .catch((err) => {
            if (err.response.status == 422) {
              // Update existing component if already exists
              Storyblok.client.put(`spaces/${targetSpaceId}/components/${this.getTargetComponentId(component.name)}`, {
                  component: component
                })
                .then(this.syncedCb.bind(this))
                .catch(this.errorCb)
            } else {
              this.errorCb(err)
            }
          })
      })
    })
  },

  errorCb(err) {
    if (err.response && err.response.data) {
      console.error(err.response.data)
    } else {
      console.error(err)
    }
  },

  syncedCb(res) {
    this.componentsSynced = this.componentsSynced + 1

    console.log(`Component ${this.componentsSynced} of ${this.componentsCount} (${res.data.component.name}) synced`)

    if (this.componentsCount == this.componentsSynced) {
      console.log('All components synced')
      process.exit(0)
    }
  },

  getTargetComponentId(name) {
    let comps = this.targetComponents.data.components.filter((comp) => {
      return comp.name == name
    })

    return comps[0].id
  }
}

Sync.init()
