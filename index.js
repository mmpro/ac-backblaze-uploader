const _ = require('lodash')
const async = require('async')

const B2 = require('backblaze-b2');
const axios = require('axios')
const crypto = require('crypto');

const acb2 = function() {
  
  let b2Auth = {}

  const init = (params) => {
    b2Auth.applicationKeyId = _.get(params, 'applicationKeyId')
    b2Auth.applicationKey = _.get(params, 'applicationKey')
    b2Auth.bucketId = _.get(params, 'bucketId')
    b2Auth.encryption = _.get(params, 'encryption')
  }

  const upload = async function(params, cb) {
    const url = _.get(params, 'url')
    const fileName = _.get(params, 'fileName')
    const expectedFileSize = _.get(params, 'expectedFileSize')
    const bucketId = _.get(b2Auth, 'bucketId') 

    const b2 = new B2({
      applicationKeyId: b2Auth.applicationKeyId,
      applicationKey: b2Auth.applicationKey
    })
    await b2.authorize()

    const multipartUploadThreshold = (5 * 1024 * 1024)
    const partSize = 5 * 1024 * 1024

    let contentLength
    let contentType
    let parts = []
    let fileId
    let classicUpload = false

    async.series({
      headObject: (done) => {
        axios.head(url)
        .then(response => {
          contentLength = _.get(response, 'headers.content-length')
          contentType = _.get(response, 'headers.content-type')
          return done()
        })
        .catch(done)
      },
      startClassicUpload: (done) => {
        if (contentLength > multipartUploadThreshold) return done()
        classicUpload = true
        b2.getUploadUrl({
          bucketId
        })
        .then(response => {
          let uploadUrl = response.data.uploadUrl;
          let authToken = response.data.authorizationToken;
          
          axios({
            method: 'get',
            url,
            responseType: 'arraybuffer' 
          })
          .then(response => {
            let uploadData = response.data
            if (_.get(b2Auth, 'encryption.enabled') && _.get(b2Auth, 'encryption.password')) {
              const algorithm =  _.get(b2Auth, 'encryption.algorithm', 'aes256')
              const password = _.get(b2Auth, 'encryption.password')
              const cipher = crypto.createCipher(algorithm, password)
              uploadData = Buffer.concat([new Buffer(cipher.update(uploadData), 'binary'), new Buffer(cipher.final('binary'), 'binary')])
            }

            b2.uploadFile({
              uploadUrl,
              uploadAuthToken: authToken,
              fileName,
              contentLength,
              mime: contentType,
              data: uploadData
            })
            .then(response => {
              if (!_.get(b2Auth, 'encryption.enabled') && _.get(response, 'data.contentLength') !== expectedFileSize) {
                return done({ message: 'fileSizeMismatch', status: 400, additionaInfo: { fileSize: _.get(response, 'data.contentLength'), expectedFileSize } })
              }
              return done(null, response.data)       
            })
            .catch(done)
          })
          .catch(done)
        })
        .catch(done)
      },
      initUpload: (done) => {
        if (classicUpload) return done()
        b2.startLargeFile({ bucketId, fileName }).then(response => {
          fileId = response.data.fileId
          return done()
        }).catch(done)
      },
      startUploadingParts: (done) => {
        if (classicUpload) return done()

        let rangeStart = 0
        let partNumber = 1

        async.whilst(
          (callback) => { return callback(null, rangeStart < contentLength) },
          (callback) => {
            let range =  'bytes=' + rangeStart + '-' + (rangeStart + partSize)
            // console.log('Request range', range)

            axios({
              method: 'get',
              url,
              responseType: 'arraybuffer',
              headers: {
                'Range': range
              }
            })            
          .then( (res) => {
            rangeStart += res.data.length
 
            let uploadData = res.data
            if (_.get(b2Auth, 'encryption.enabled') && _.get(b2Auth, 'encryption.password')) {
              const algorithm =  _.get(b2Auth, 'encryption.algorithm', 'aes256')
              const password = _.get(b2Auth, 'encryption.password')
              const cipher = crypto.createCipher(algorithm, password)
              uploadData = Buffer.concat([new Buffer(cipher.update(uploadData), 'binary'), new Buffer(cipher.final('binary'), 'binary')])
            }

            // upload that part
            b2.getUploadPartUrl({ fileId })
              .then(response => {
                let uploadUrl = response.data.uploadUrl;
                let authToken = response.data.authorizationToken;
                
                b2.uploadPart({
                  partNumber,
                  uploadUrl,
                  uploadAuthToken: authToken,
                  data: uploadData
                })
                .then(part => {
                  parts.push(part.data)
                  partNumber += 1
                  return callback()                
                })
                .catch(callback)
              })
              .catch(callback)
            })
            .catch(callback)
          },
          done)
      },
      finishUpload: (done) => {
        if (classicUpload) return done()

        b2.finishLargeFile({
          fileId,
          partSha1Array: _.map(parts, 'contentSha1')
        })
        .then(response => {
          return done(null, response.data)
        })
        .catch(done)
      }
    }, (err) => {
      if (err && !classicUpload) {
        b2.cancelLargeFile({
          fileId
        }).catch(err => {
          console.log('ACB2 | Cancel Large File Upload failed %j', err)
        })
      }
      return cb(err)
    })
  }

  return {
    init,
    upload
  }
}

module.exports = acb2()


